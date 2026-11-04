import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* ──────────────────────────────────────────────────────────────────────────
   Supabase est facultatif : sans variables d'environnement, l'app reste
   100 % locale et affiche un bandeau discret « Sync désactivée ».
   Seules l'URL et la clé publique `anon` sont utilisées côté client.
   ────────────────────────────────────────────────────────────────────────── */

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

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
