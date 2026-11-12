import type { SyncState, SyncTable } from '../types'
import { db, nowIso } from '../db/db'
import { ROWS_TABLE, SYNC_CONFIGURED, supabase } from './supabase'

/* ──────────────────────────────────────────────────────────────────────────
   Local d'abord : chaque écriture part dans Dexie, puis une file pousse vers
   Supabase dès que le réseau est là. Conflit : dernière modification gagne,
   comparée sur l'horodatage de la ligne.
   ────────────────────────────────────────────────────────────────────────── */

const TABLES: SyncTable[] = [
  'checkins',
  'workouts',
  'exercises',
  'goals',
  'metrics',
  'templates',
  'workoutTypes',
  'settings',
  'tasks',
  'deadlines',
  'notes',
  'programs',
  'reviews',
  'injuries',
]

const LAST_SYNC_KEY = 'last_sync_at'

type Listener = (s: SyncState) => void
const listeners = new Set<Listener>()
let state: SyncState = SYNC_CONFIGURED ? { kind: 'signed-out' } : { kind: 'disabled' }
let running = false

export function getSyncState(): SyncState {
  return state
}

export function onSyncState(fn: Listener): () => void {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

function setState(next: SyncState) {
  state = next
  for (const fn of listeners) fn(next)
}

async function pendingCount(): Promise<number> {
  try {
    return await db.syncQueue.count()
  } catch {
    return 0
  }
}

function localTable(table: SyncTable) {
  switch (table) {
    case 'checkins':
      return db.checkins
    case 'workouts':
      return db.workouts
    case 'exercises':
      return db.exercises
    case 'goals':
      return db.goals
    case 'metrics':
      return db.metrics
    case 'templates':
      return db.templates
    case 'workoutTypes':
      return db.workoutTypes
    case 'settings':
      return db.settings
    case 'tasks':
      return db.tasks
    case 'deadlines':
      return db.deadlines
    case 'notes':
      return db.notes
    case 'programs':
      return db.programs
    case 'reviews':
      return db.reviews
    case 'injuries':
      return db.injuries
  }
}

export async function currentEmail(): Promise<string | null> {
  const sb = supabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session?.user?.email ?? null
}

export async function sendMagicLink(email: string): Promise<void> {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée.')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  })
  if (error) throw error
}

/** Connexion par mot de passe : aucun e-mail envoyé, donc aucune limite d'envoi. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée.')
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Création du compte avec mot de passe (une seule fois). */
export async function signUpWithPassword(email: string, password: string): Promise<void> {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée.')
  const { error, data } = await sb.auth.signUp({ email, password })
  if (error) throw error
  /* Si la confirmation par mail est active côté Supabase, aucune session n'est créée tout de suite. */
  if (!data.session) throw new Error('Compte créé. Connecte-toi maintenant avec ton mot de passe.')
}

/** Connexion par code à 6 chiffres reçu par e-mail : pas de lien à ouvrir, donc rien à consommer par erreur. */
export async function verifyEmailCode(email: string, token: string): Promise<void> {
  const sb = supabase()
  if (!sb) throw new Error('Synchronisation non configurée.')
  const { error } = await sb.auth.verifyOtp({ email, token: token.replace(/\s/g, ''), type: 'email' })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const sb = supabase()
  if (!sb) return
  await sb.auth.signOut()
  await db.meta.delete(LAST_SYNC_KEY)
  setState({ kind: 'signed-out' })
}

/** Met en file toutes les lignes locales (première synchronisation d'un appareil). */
async function enqueueAllLocal(): Promise<void> {
  for (const table of TABLES) {
    const rows = (await localTable(table).toArray()) as unknown as { id?: string; day?: string; updatedAt?: string }[]
    for (const row of rows) {
      const id = row.id ?? row.day
      if (!id) continue
      await db.syncQueue.add({
        table,
        rowId: String(id),
        payload: row,
        op: 'upsert',
        updatedAt: row.updatedAt ?? nowIso(),
      })
    }
  }
}

/** Pousse la file locale, puis récupère les modifications distantes. */
export async function syncNow(): Promise<void> {
  const sb = supabase()
  if (!sb || running) return
  running = true
  try {
    const { data: sessionData } = await sb.auth.getSession()
    const session = sessionData.session
    if (!session) {
      setState({ kind: 'signed-out' })
      return
    }
    const email = session.user.email ?? ''
    const userId = session.user.id
    setState({ kind: 'syncing', email, pending: await pendingCount() })

    /* 0. Première connexion sur cet appareil : tout ce qui existe déjà ici doit partir aussi
          (programme importé, séances, check-ins…), pas seulement ce qui sera modifié ensuite. */
    const doneKey = `initial_push:${userId}`
    if (!(await db.meta.get(doneKey))) {
      await enqueueAllLocal()
      await db.meta.put({ key: doneKey, value: nowIso() })
    }

    /* 1. Pousser, par paquets, jusqu'à ce que la file soit vide. */
    for (let batch = 0; batch < 60; batch++) {
      const ops = await db.syncQueue.orderBy('id').limit(300).toArray()
      if (!ops.length) break
      /* Une seule version par ligne dans un paquet (la dernière), sinon la base refuse. */
      const byKey = new Map<string, Record<string, unknown>>()
      for (const op of ops) {
        byKey.set(`${op.table}|${op.rowId}`, {
          user_id: userId,
          table_name: op.table,
          row_id: op.rowId,
          data: op.payload ?? {},
          deleted: op.op === 'delete',
          updated_at: op.updatedAt,
        })
      }
      const rows = [...byKey.values()]
      const { error } = await sb.from(ROWS_TABLE).upsert(rows, {
        onConflict: 'user_id,table_name,row_id',
      })
      if (error) throw error
      await db.syncQueue.bulkDelete(ops.map((o) => o.id!).filter((v) => v !== undefined))
    }

    /* 2. Récupérer. */
    const last = (await db.meta.get(LAST_SYNC_KEY))?.value as string | undefined
    let query = sb
      .from(ROWS_TABLE)
      .select('table_name,row_id,data,updated_at,deleted')
      .order('updated_at', { ascending: true })
      .limit(2000)
    if (last) query = query.gt('updated_at', last)
    const { data, error } = await query
    if (error) throw error

    let newest = last ?? '1970-01-01T00:00:00.000Z'
    for (const row of data ?? []) {
      const table = row.table_name as SyncTable
      if (!TABLES.includes(table)) continue
      if (row.updated_at > newest) newest = row.updated_at
      const store = localTable(table)
      const incoming = row.data as { id?: string; updatedAt?: string } | null
      const id = (incoming?.id ?? row.row_id) as string
      const existing = (await store.get(id as never)) as { updatedAt?: string } | undefined
      if (existing?.updatedAt && incoming?.updatedAt && existing.updatedAt >= incoming.updatedAt) {
        continue /* La version locale est plus récente : on la garde. */
      }
      if (row.deleted) {
        if (['checkins', 'workouts', 'goals', 'tasks', 'deadlines', 'notes', 'programs', 'reviews', 'injuries'].includes(table)) {
          if (incoming) await store.put({ ...incoming, id, deleted: true } as never)
        } else {
          await store.delete(id as never)
        }
      } else if (incoming) {
        await store.put({ ...incoming, id } as never)
      }
    }
    await db.meta.put({ key: LAST_SYNC_KEY, value: newest })

    setState({ kind: 'idle', email, lastSync: nowIso(), pending: await pendingCount() })
  } catch (e) {
    setState({
      kind: 'error',
      message: e instanceof Error ? e.message : 'Synchronisation impossible',
    })
  } finally {
    running = false
  }
}

let timer: number | undefined

/** Démarre la synchronisation : au chargement, au retour du réseau, puis périodiquement. */
export function startSync(): () => void {
  const sb = supabase()
  if (!sb) {
    setState({ kind: 'disabled' })
    return () => {}
  }
  const kick = () => {
    if (navigator.onLine) void syncNow()
  }
  sb.auth.onAuthStateChange((_event, session) => {
    if (session) kick()
    else setState({ kind: 'signed-out' })
  })
  void (async () => {
    const email = await currentEmail()
    if (email) kick()
    else setState({ kind: 'signed-out' })
  })()
  window.addEventListener('online', kick)
  timer = window.setInterval(kick, 90_000)
  return () => {
    window.removeEventListener('online', kick)
    if (timer) window.clearInterval(timer)
  }
}

export { SYNC_CONFIGURED }
