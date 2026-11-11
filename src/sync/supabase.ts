import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* ──────────────────────────────────────────────────────────────────────────
   Supabase est facultatif : sans variables d'environnement, l'app reste
   100 % locale et affiche un bandeau discret « Sync désactivée ».
   Seules l'URL et la clé publique `anon` sont utilisées côté client.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * La configuration vient du build (variables d'environnement) ou, plus simplement, de
 * Réglages → Synchronisation : l'URL et la clé publique `anon` sont enregistrées dans ce
 * navigateur. Ce sont des valeurs publiques par conception (la sécurité repose sur les
 * règles RLS de la base), contrairement à la clé `service_role` qu'il ne faut jamais mettre ici.
 */
const STORE_KEY = 'soma-sync-config'

export interface SyncConfig {
  url: string
  key: string
}

function readStored(): SyncConfig | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<SyncConfig>
    return v.url && v.key ? { url: v.url.trim(), key: v.key.trim() } : null
  } catch {
    return null
  }
}

const stored = readStored()
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim() || stored?.url || ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim() || stored?.key || ''

/** La configuration en cours, pour l'afficher ou la partager vers un autre appareil. */
export function currentSyncConfig(): SyncConfig | null {
  return url && anonKey ? { url, key: anonKey } : null
}

/** Vrai si la configuration enregistrée ici (et non fournie par le build) est utilisée. */
export const SYNC_FROM_BROWSER = Boolean(stored) && !(import.meta.env.VITE_SUPABASE_URL ?? '').trim()

export function validateSyncConfig(c: SyncConfig): string | null {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url.trim()) && !/^https?:\/\/\S+$/i.test(c.url.trim()))
    return 'L’adresse doit ressembler à https://xxxx.supabase.co'
  if (c.key.trim().length < 20) return 'La clé est trop courte : copie la clé « anon public » en entier.'
  /* Une clé service_role donne tous les droits : on la refuse. */
  try {
    const payload = JSON.parse(atob(c.key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    if (payload.role === 'service_role') return 'Cette clé est la clé secrète (service_role). Il faut la clé « anon public ».'
  } catch {
    /* clé de nouveau format (sb_publishable_…) : pas de contrôle possible */
  }
  return null
}

export function saveSyncConfig(c: SyncConfig) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify({ url: c.url.trim().replace(/\/$/, ''), key: c.key.trim() }))
}

export function clearSyncConfig() {
  window.localStorage.removeItem(STORE_KEY)
}

/** Lien à ouvrir sur un autre appareil pour y copier la même configuration. */
export function shareLink(c: SyncConfig): string {
  const b64 = btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${window.location.origin}${window.location.pathname}#/reglages/sync:${b64}`
}

export function parseShared(param: string): SyncConfig | null {
  if (!param.startsWith('sync:')) return null
  try {
    const b64 = param.slice(5).replace(/-/g, '+').replace(/_/g, '/')
    const v = JSON.parse(atob(b64)) as Partial<SyncConfig>
    return v.url && v.key ? { url: v.url, key: v.key } : null
  } catch {
    return null
  }
}

export const SYNC_CONFIGURED = Boolean(url && anonKey && url.startsWith('http'))

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient | null {
  if (!SYNC_CONFIGURED) return null
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'soma-auth',
      },
    })
  }
  return client
}

export const ROWS_TABLE = 'soma_rows'
export const PROFILE_TABLE = 'soma_profiles'
