import { dayKey } from '../engine/time'

/* ──────────────────────────────────────────────────────────────────────────
   Google Agenda + Gmail, en LECTURE SEULE, directement depuis le navigateur.
   – Connexion OAuth par Google Identity Services avec TON identifiant client
     (public par nature) enregistré dans ce navigateur. Aucun secret, aucun serveur.
   – Portées demandées : calendar.readonly et gmail.readonly. Rien ne peut être
     écrit, envoyé ni supprimé : seules des requêtes GET sont émises.
   – Le jeton (1 h) reste dans ce navigateur ; au-delà il suffit de se reconnecter.
   ────────────────────────────────────────────────────────────────────────── */

export const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly'

export interface AgendaEvent {
  id: string
  title: string
  day: string
  /** Heure de début `HH:MM`, absente pour un événement sur la journée. */
  time?: string
  endTime?: string
  allDay: boolean
  location?: string
  url?: string
  calendar?: string
}

export interface MailItem {
  id: string
  from: string
  subject: string
  date: string
  snippet: string
  unread: boolean
  important: boolean
  url: string
}

/* ── Lecture des réponses de l'API (pures, testées) ──────────────────── */

interface RawEvent {
  id?: string
  status?: string
  summary?: string
  location?: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

const hhmm = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function parseEvents(json: { items?: RawEvent[] }, calendar?: string): AgendaEvent[] {
  const out: AgendaEvent[] = []
  for (const e of json.items ?? []) {
    if (!e.id || e.status === 'cancelled') continue
    const allDay = !!e.start?.date && !e.start?.dateTime
    const startIso = e.start?.dateTime ?? e.start?.date
    if (!startIso) continue
    out.push({
      id: e.id,
      title: e.summary?.trim() || '(sans titre)',
      day: allDay ? startIso : dayKey(new Date(startIso)),
      time: allDay ? undefined : hhmm(startIso),
      endTime: !allDay && e.end?.dateTime ? hhmm(e.end.dateTime) : undefined,
      allDay,
      location: e.location?.trim() || undefined,
      url: e.htmlLink,
      calendar,
    })
  }
  return out.sort((a, b) => (a.day + (a.time ?? '')).localeCompare(b.day + (b.time ?? '')))
}

interface RawMessage {
  id?: string
  threadId?: string
  snippet?: string
  labelIds?: string[]
  payload?: { headers?: { name: string; value: string }[] }
}

/** « Nom <adresse> » → « Nom ». */
export const senderName = (from: string): string => {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
  return (m?.[1]?.trim() || m?.[2] || from).trim()
}

export function parseMessage(raw: RawMessage): MailItem | null {
  if (!raw.id) return null
  const h = (name: string) => raw.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? ''
  const labels = raw.labelIds ?? []
  const date = h('date')
  const parsed = date ? new Date(date) : null
  return {
    id: raw.id,
    from: senderName(h('from')) || 'Expéditeur inconnu',
    subject: h('subject') || '(sans objet)',
    date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : '',
    snippet: (raw.snippet ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    unread: labels.includes('UNREAD'),
    important: labels.includes('IMPORTANT') || labels.includes('STARRED'),
    url: `https://mail.google.com/mail/u/0/#inbox/${raw.threadId ?? raw.id}`,
  }
}

/* ── Configuration et jeton ───────────────────────────────────────────── */

const CLIENT_KEY = 'soma-google-client'
const TOKEN_KEY = 'soma-google-token'
const CACHE_KEY = 'soma-google-cache'

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const getClientId = (): string => safe(() => window.localStorage.getItem(CLIENT_KEY) ?? '', '')
export const setClientId = (id: string) => safe(() => window.localStorage.setItem(CLIENT_KEY, id.trim()), undefined)

export function validateClientId(id: string): string | null {
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(id.trim())
    ? null
    : 'L’identifiant doit ressembler à 123456-abcdef.apps.googleusercontent.com'
}

interface StoredToken {
  token: string
  expiresAt: number
}
const readToken = (): StoredToken | null =>
  safe(() => {
    const raw = window.localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw) as StoredToken
    return t.token && t.expiresAt > Date.now() + 30_000 ? t : null
  }, null)

export const hasValidToken = (): boolean => !!readToken()

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (c: {
            client_id: string
            scope: string
            callback: (r: GoogleTokenResponse) => void
            error_callback?: (e: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

let scriptLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      scriptLoading = null
      reject(new Error('Impossible de joindre Google (réseau ou bloqueur de publicités).'))
    }
    document.head.appendChild(s)
  })
  return scriptLoading
}

/** Ouvre la fenêtre Google pour autoriser la lecture ; doit être appelé depuis un clic. */
export async function connect(): Promise<void> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Renseigne d’abord ton identifiant client Google.')
  await loadGis()
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      callback: (r) => {
        if (!r.access_token) return reject(new Error(r.error ?? 'Connexion refusée.'))
        safe(
          () =>
            window.localStorage.setItem(
              TOKEN_KEY,
              JSON.stringify({ token: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 }),
            ),
          undefined,
        )
        resolve()
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Fenêtre fermée avant la fin.' : (e.message ?? 'Connexion impossible.'))),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export function disconnect(): void {
  const t = readToken()
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t.token)
  safe(() => {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(CACHE_KEY)
  }, undefined)
}

/* ── Appels (GET uniquement) ──────────────────────────────────────────── */

async function get<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    safe(() => window.localStorage.removeItem(TOKEN_KEY), undefined)
    throw new Error('Connexion Google expirée : reconnecte-toi.')
  }
  if (res.status === 403) throw new Error('Accès refusé : active les API Agenda et Gmail dans ton projet Google.')
  if (!res.ok) throw new Error(`Google a répondu ${res.status}.`)
  return (await res.json()) as T
}

export async function fetchAgenda(days = 14): Promise<AgendaEvent[]> {
  const t = readToken()
  if (!t) throw new Error('Connexion Google expirée : reconnecte-toi.')
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from.getTime() + days * 86_400_000)
  const q = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '60',
  })
  const json = await get<{ items?: RawEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`,
    t.token,
  )
  return parseEvents(json, 'primary')
}

/** Mails non lus ou importants de la boîte de réception, les 20 plus récents. */
export async function fetchMails(limit = 20): Promise<MailItem[]> {
  const t = readToken()
  if (!t) throw new Error('Connexion Google expirée : reconnecte-toi.')
  const list = await get<{ messages?: { id: string }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: 'in:inbox (is:unread OR is:important)', maxResults: String(limit) })}`,
    t.token,
  )
  const items = await Promise.all(
    (list.messages ?? []).map((m) =>
      get<RawMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        t.token,
      ).then(parseMessage),
    ),
  )
  return items
    .filter((x): x is MailItem => !!x)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/* ── Dernier état connu, pour l'affichage hors ligne ──────────────────── */

export interface GoogleCache {
  agenda: AgendaEvent[]
  mails: MailItem[]
  at: string
}
export const readCache = (): GoogleCache | null =>
  safe(() => JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null') as GoogleCache | null, null)
export const writeCache = (c: GoogleCache) => safe(() => window.localStorage.setItem(CACHE_KEY, JSON.stringify(c)), undefined)
