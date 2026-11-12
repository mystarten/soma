import { supabase } from '../sync/supabase'
import { buildWhoopPreview } from '../engine/whoop'
import { dayKey } from '../engine/time'
import { apiToFiles, type WhoopApiData } from './whoopApi'
import { db, nowIso, uid } from '../db/db'
import { recordImport, saveCheckIns, saveWorkouts } from '../db/repo'

/* Connexion WHOOP : tout passe par la fonction Supabase « whoop » (le secret WHOOP n'est jamais dans le navigateur). */

const STATE_KEY = 'soma-whoop-state'

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const sb = supabase()
  if (!sb) throw new Error('Active d’abord la synchronisation (Supabase) : WHOOP en a besoin.')
  const { data, error } = await sb.functions.invoke('whoop', { body })
  if (error) {
    /* On remonte la vraie cause : fonction absente, accès refusé, ou réponse d'erreur de la fonction. */
    const ctx = (error as { context?: unknown }).context
    if (typeof Response !== 'undefined' && ctx instanceof Response) {
      let detail: string | undefined
      try {
        const body = (await ctx.clone().json()) as { error?: string; message?: string } | null
        detail = body?.error ?? body?.message
      } catch {
        /* réponse sans JSON */
      }
      if (detail) throw new Error(detail)
      if (ctx.status === 404) throw new Error('La fonction « whoop » est introuvable dans ce projet : déploie-la (Edge Functions → Deploy a new function), avec le nom exact « whoop ».')
      if (ctx.status === 401 || ctx.status === 403) throw new Error('Accès refusé : reconnecte-toi (Réglages → Synchronisation), puis réessaie.')
      throw new Error(`La fonction « whoop » a répondu ${ctx.status}. Regarde l’onglet Logs de la fonction dans Supabase.`)
    }
    throw new Error(
      `Impossible de joindre la fonction « whoop » (${error instanceof Error ? error.message : 'réseau'}). Vérifie qu’elle est bien déployée sous ce nom exact, dans le même projet que la synchronisation.`,
    )
  }
  const d = data as { error?: string } & T
  if (d?.error) throw new Error(d.error)
  return d
}

export const redirectUri = () => `${window.location.origin}${window.location.pathname}`

export async function whoopConnected(): Promise<boolean> {
  const c = (await call<{ connected: boolean }>({ action: 'status' })).connected
  setWhoopConnectedFlag(c)
  return c
}

/** Ouvre la page d'autorisation WHOOP. */
export async function whoopStart(): Promise<void> {
  const state = uid('st')
  window.sessionStorage.setItem(STATE_KEY, state)
  const { url } = await call<{ url: string }>({ action: 'authorize-url', redirectUri: redirectUri(), state })
  window.location.href = url
}

/** À appeler au chargement : si WHOOP vient de nous renvoyer un code, on l'échange. */
export async function whoopHandleReturn(): Promise<'done' | 'none' | string> {
  const q = new URLSearchParams(window.location.search)
  const code = q.get('code')
  const state = q.get('state')
  if (!code || !state) return 'none'
  const expected = window.sessionStorage.getItem(STATE_KEY)
  const clean = () => window.history.replaceState(null, '', `${window.location.pathname}#/reglages`)
  if (!expected || expected !== state) {
    clean()
    return 'Retour WHOOP non reconnu : recommence la connexion.'
  }
  window.sessionStorage.removeItem(STATE_KEY)
  try {
    await call({ action: 'exchange', code, redirectUri: redirectUri() })
    setWhoopConnectedFlag(true)
    clean()
    return 'done'
  } catch (e) {
    clean()
    return e instanceof Error ? e.message : 'Connexion WHOOP impossible.'
  }
}

export async function whoopDisconnect(): Promise<void> {
  await call({ action: 'disconnect' })
  setWhoopConnectedFlag(false)
}

export interface WhoopLast {
  at: string
  days: number
  withRecovery: number
  received: { recovery: number; sleep: number; cycles: number; workouts: number }
}
const LAST_KEY = 'soma-whoop-last'
const CONNECTED_KEY = 'soma-whoop-connected'
export const readWhoopLast = (): WhoopLast | null => {
  try {
    return JSON.parse(window.localStorage.getItem(LAST_KEY) ?? 'null') as WhoopLast | null
  } catch {
    return null
  }
}
export const setWhoopConnectedFlag = (on: boolean) => {
  try {
    window.localStorage.setItem(CONNECTED_KEY, on ? '1' : '0')
  } catch {
    /* sans stockage, pas de récupération automatique */
  }
}
export const whoopConnectedFlag = (): boolean => {
  try {
    return window.localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

/** Récupère les derniers jours depuis WHOOP et les ajoute (sans doublons, sans écraser tes saisies). */
export async function whoopSync(
  days = 30,
): Promise<{ days: number; workouts: number; withRecovery: number; received: { recovery: number; sleep: number; cycles: number; workouts: number } }> {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  const raw = await call<WhoopApiData>({ action: 'fetch', start: start.toISOString(), end: end.toISOString() })
  const received = { recovery: raw.recovery?.length ?? 0, sleep: raw.sleep?.length ?? 0, cycles: raw.cycles?.length ?? 0, workouts: raw.workouts?.length ?? 0 }
  const files = apiToFiles(raw)
  const remember = (r: Omit<WhoopLast, 'at'>) => {
    try {
      window.localStorage.setItem(LAST_KEY, JSON.stringify({ at: nowIso(), ...r }))
    } catch {
      /* facultatif */
    }
  }
  if (!files.length) {
    remember({ days: 0, withRecovery: 0, received })
    return { days: 0, workouts: 0, withRecovery: 0, received }
  }
  const [checkins, workouts] = await Promise.all([db.checkins.toArray(), db.workouts.toArray()])
  /* Anciennes valeurs WHOOP de la période (éventuellement rangées au mauvais jour) : on les retire,
     elles sont réécrites ci-dessous avec le bon jour. Les saisies à la main ne sont jamais touchées. */
  const from = dayKey(start)
  const fromCycles = ['recovery', 'restingHr', 'hrv', 'whoopDayStrain', 'respiratoryRate', 'spo2', 'skinTempC'] as const
  const cleaned = checkins
    .filter((c) => !c.deleted && c.source === 'whoop' && c.day >= from)
    .map((c) => {
      const copy = { ...c } as Record<string, unknown>
      for (const k of fromCycles) delete copy[k]
      return { ...copy, updatedAt: nowIso() } as typeof c
    })
  if (cleaned.length) await saveCheckIns(cleaned)
  const preview = buildWhoopPreview(files, { checkins: [...checkins.filter((c) => !cleaned.some((x) => x.day === c.day)), ...cleaned], workouts })
  if (preview.days.length) await saveCheckIns(preview.days)
  if (preview.workouts.length) await saveWorkouts(preview.workouts)
  await recordImport({
    id: uid('imp'),
    importedAt: nowIso(),
    files: ['API WHOOP'],
    dayCount: preview.days.length,
    workoutCount: preview.workouts.length,
    nightCount: preview.nights,
  })
  const withRecovery = preview.days.filter((d) => typeof d.recovery === 'number').length
  remember({ days: preview.days.length, withRecovery, received })
  return { days: preview.days.length, workouts: preview.workouts.length, withRecovery, received }
}
