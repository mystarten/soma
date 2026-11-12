import { supabase } from '../sync/supabase'
import { buildWhoopPreview } from '../engine/whoop'
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
  return (await call<{ connected: boolean }>({ action: 'status' })).connected
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
    clean()
    return 'done'
  } catch (e) {
    clean()
    return e instanceof Error ? e.message : 'Connexion WHOOP impossible.'
  }
}

export async function whoopDisconnect(): Promise<void> {
  await call({ action: 'disconnect' })
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
  if (!files.length) return { days: 0, workouts: 0, withRecovery: 0, received }
  const [checkins, workouts] = await Promise.all([db.checkins.toArray(), db.workouts.toArray()])
  const preview = buildWhoopPreview(files, { checkins, workouts })
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
  return { days: preview.days.length, workouts: preview.workouts.length, withRecovery: preview.days.filter((d) => typeof d.recovery === 'number').length, received }
}
