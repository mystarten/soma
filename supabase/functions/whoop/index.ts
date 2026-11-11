// Fonction Supabase « whoop » : fait le pont avec l'API WHOOP.
// Pourquoi une fonction : l'échange du code OAuth exige le « client secret » WHOOP, qui ne doit
// jamais se trouver dans un navigateur. Les jetons restent ici, dans la table whoop_tokens.
//
// Secrets à définir (Edge Functions → Secrets) : WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET.
// SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const API = 'https://api.prod.whoop.com/developer'
const SCOPES = 'read:recovery read:cycles read:workout read:sleep read:profile offline'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const env = (k: string) => Deno.env.get(k) ?? ''

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('WHOOP_CLIENT_ID'), client_secret: env('WHOOP_CLIENT_SECRET'), ...params }),
  })
  if (!res.ok) throw new Error(`WHOOP a refusé la connexion (${res.status}).`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const user = (
      await createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      }).auth.getUser()
    ).data.user
    if (!user) return json({ error: 'Non connecté.' }, 401)
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
    const body = (await req.json().catch(() => ({}))) as Record<string, string>

    const save = async (t: { access_token: string; refresh_token?: string; expires_in: number }, keepRefresh?: string | null) => {
      await admin.from('whoop_tokens').upsert({
        user_id: user.id,
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? keepRefresh ?? null,
        expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    if (body.action === 'authorize-url') {
      if (!env('WHOOP_CLIENT_ID')) return json({ error: 'WHOOP_CLIENT_ID manque dans les secrets de la fonction.' }, 500)
      const q = new URLSearchParams({
        client_id: env('WHOOP_CLIENT_ID'),
        redirect_uri: body.redirectUri,
        response_type: 'code',
        scope: SCOPES,
        state: body.state,
      })
      return json({ url: `${AUTH_URL}?${q}` })
    }

    if (body.action === 'exchange') {
      await save(await tokenRequest({ grant_type: 'authorization_code', code: body.code, redirect_uri: body.redirectUri }))
      return json({ ok: true })
    }

    const { data: row } = await admin.from('whoop_tokens').select('*').eq('user_id', user.id).maybeSingle()

    if (body.action === 'status') return json({ connected: !!row })
    if (body.action === 'disconnect') {
      await admin.from('whoop_tokens').delete().eq('user_id', user.id)
      return json({ ok: true })
    }

    if (body.action === 'fetch') {
      if (!row) return json({ error: 'WHOOP n’est pas connecté.' }, 400)
      let access = row.access_token as string
      if (Date.parse(row.expires_at) < Date.now() + 60_000) {
        if (!row.refresh_token) return json({ error: 'Connexion WHOOP expirée : reconnecte-la.' }, 401)
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token, scope: 'offline' })
        await save(t, row.refresh_token)
        access = t.access_token
      }
      const start = body.start
      const end = body.end
      const collect = async (path: string) => {
        for (const version of ['v2', 'v1']) {
          const all: unknown[] = []
          let next = ''
          let ok = true
          for (let page = 0; page < 10; page++) {
            const q = new URLSearchParams({ start, end, limit: '25' })
            if (next) q.set('nextToken', next)
            const res = await fetch(`${API}/${version}/${path}?${q}`, { headers: { Authorization: `Bearer ${access}` } })
            if (res.status === 404 && page === 0) {
              ok = false
              break
            }
            if (!res.ok) throw new Error(`WHOOP a répondu ${res.status} pour ${path}.`)
            const j = (await res.json()) as { records?: unknown[]; next_token?: string }
            all.push(...(j.records ?? []))
            next = j.next_token ?? ''
            if (!next) break
          }
          if (ok) return all
        }
        return []
      }
      const [recovery, sleep, cycles, workouts] = await Promise.all([
        collect('recovery'),
        collect('activity/sleep'),
        collect('cycle'),
        collect('activity/workout'),
      ])
      return json({ recovery, sleep, cycles, workouts })
    }

    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur.' }, 500)
  }
})
