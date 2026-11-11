import { useSyncExternalStore } from 'react'
import {
  connect as gConnect,
  disconnect as gDisconnect,
  fetchAgenda,
  fetchMails,
  getClientId,
  hasValidToken,
  readCache,
  writeCache,
  type AgendaEvent,
  type MailItem,
} from './google'

/* Petit magasin partagé : l'agenda et les mails sont chargés une fois et utilisés par plusieurs panneaux. */

export interface GoogleState {
  configured: boolean
  connected: boolean
  loading: boolean
  error: string | null
  agenda: AgendaEvent[]
  mails: MailItem[]
  at: string | null
}

const cached = typeof window === 'undefined' ? null : readCache()
let state: GoogleState = {
  configured: typeof window !== 'undefined' && !!getClientId(),
  connected: typeof window !== 'undefined' && hasValidToken(),
  loading: false,
  error: null,
  agenda: cached?.agenda ?? [],
  mails: cached?.mails ?? [],
  at: cached?.at ?? null,
}
const listeners = new Set<() => void>()
const set = (p: Partial<GoogleState>) => {
  state = { ...state, ...p }
  for (const l of listeners) l()
}
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function refreshGoogle(): Promise<void> {
  if (state.loading) return
  set({ configured: !!getClientId(), connected: hasValidToken() })
  if (!state.connected) return
  set({ loading: true, error: null })
  const [a, m] = await Promise.allSettled([fetchAgenda(14), fetchMails(20)])
  const agenda = a.status === 'fulfilled' ? a.value : state.agenda
  const mails = m.status === 'fulfilled' ? m.value : state.mails
  const err = [a, m].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
  const at = new Date().toISOString()
  if (!err) writeCache({ agenda, mails, at })
  set({
    loading: false,
    agenda,
    mails,
    at: err ? state.at : at,
    connected: hasValidToken(),
    error: err ? (err.reason instanceof Error ? err.reason.message : 'Lecture impossible.') : null,
  })
}

export async function connectGoogle(): Promise<void> {
  try {
    await gConnect()
    set({ configured: true, connected: true, error: null })
    await refreshGoogle()
  } catch (e) {
    set({ error: e instanceof Error ? e.message : 'Connexion impossible.' })
  }
}

export function disconnectGoogle(): void {
  gDisconnect()
  set({ connected: false, agenda: [], mails: [], at: null, error: null })
}

export function notifyConfigChanged(): void {
  set({ configured: !!getClientId(), connected: hasValidToken() })
}

export function useGoogle(): GoogleState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
