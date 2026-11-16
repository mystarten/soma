import { useState } from 'react'
import { Button, Segmented, TextInput } from './ui/primitives'
import { SYNC_CONFIGURED, saveSyncConfig, validateSyncConfig } from '../sync/supabase'
import { sendPasswordReset, signInWithPassword, signUpWithPassword } from '../sync/syncEngine'

/** Traduit les erreurs du serveur en phrases simples. */
function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/invalid login|invalid credentials/i.test(m)) return 'Email ou mot de passe incorrect.'
  if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet email : choisis « Se connecter ».'
  if (/at least \d+ characters|weak/i.test(m)) return 'Le mot de passe doit faire au moins 6 caractères.'
  if (/rate limit|too many/i.test(m)) return 'Trop d’essais. Attends quelques minutes puis réessaie.'
  if (/not confirmed/i.test(m)) return 'Confirme d’abord ton email (regarde ta boîte mail), puis connecte-toi.'
  if (/valid email|invalid format|unable to validate email/i.test(m)) return 'Cet email n’a pas l’air valide.'
  if (/fetch|network|failed/i.test(m)) return 'Pas de connexion au serveur. Vérifie ton réseau.'
  return m
}

export const LOCAL_MODE_KEY = 'soma-local-mode'

/** Écran d'accueil : créer un compte ou se connecter. Chaque personne a son propre espace, invisible des autres. */
export default function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'up') {
        try {
          await signUpWithPassword(email.trim(), password)
        } catch (e) {
          /* « Compte créé. Connecte-toi » : on enchaîne directement la connexion. */
          if (e instanceof Error && /^Compte créé/.test(e.message)) await signInWithPassword(email.trim(), password)
          else throw e
        }
      } else await signInWithPassword(email.trim(), password)
    } catch (e) {
      setMsg({ kind: 'err', text: friendly(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold tracking-[0.35em] text-mist-100">SOMA</div>
        <p className="mt-2 text-sm text-mist-300">Ton programme d’entraînement, simple et toujours avec toi.</p>
      </div>

      {SYNC_CONFIGURED ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'in', label: 'Se connecter' }, { value: 'up', label: 'Créer mon compte' }]} className="w-full justify-center [&>button]:flex-1" />
          <label className="text-xs text-mist-300">
            Email
            <TextInput className="mt-1" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.fr" />
          </label>
          <label className="text-xs text-mist-300">
            Mot de passe {mode === 'up' && <span className="text-mist-500">(6 caractères minimum)</span>}
            <div className="relative mt-1">
              <TextInput type={show ? 'text' : 'password'} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-mist-500">{show ? 'Masquer' : 'Afficher'}</button>
            </div>
          </label>
          {msg && (
            <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 text-sm ${msg.kind === 'err' ? 'bg-[#ff5a5a]/12 text-[#ff9a9a]' : 'bg-accent/10 text-mist-100'}`}>
              {msg.text}
            </p>
          )}
          <Button type="submit" variant="primary" full disabled={busy || !email || password.length < 6} className="!py-3.5 text-base">
            {busy ? 'Un instant…' : mode === 'up' ? 'Créer mon compte' : 'Me connecter'}
          </Button>
          {mode === 'in' && (
            <button
              type="button"
              className="text-center text-sm text-accent"
              onClick={async () => {
                if (!email.trim()) return setMsg({ kind: 'err', text: 'Écris d’abord ton email au-dessus.' })
                try {
                  await sendPasswordReset(email.trim())
                  setMsg({ kind: 'ok', text: 'Un lien pour choisir un nouveau mot de passe vient d’être envoyé à ton email.' })
                } catch (e) {
                  setMsg({ kind: 'err', text: friendly(e) })
                }
              }}
            >
              Mot de passe oublié ?
            </button>
          )}
          <p className="mt-2 text-center text-xs text-mist-500">Chaque compte a son propre espace : personne d’autre ne voit tes programmes.</p>
        </form>
      ) : (
        <Unconfigured />
      )}
    </div>
  )
}

/** Serveur pas encore relié (aucune configuration dans le build) : on propose de le saisir ou de rester en local. */
function Unconfigured() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl bg-white/5 p-3 text-sm text-mist-300 hairline">Le serveur de comptes n’est pas encore relié à cette application. Tu peux le relier ici (adresse du projet et clé publique « anon »), ou continuer sans compte sur cet appareil.</p>
      <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoCapitalize="none" />
      <TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="Clé anon publique (eyJ…)" autoCapitalize="none" />
      {err && <p className="text-sm text-[#ff9a9a]">{err}</p>}
      <Button
        variant="primary"
        full
        onClick={() => {
          const e = validateSyncConfig({ url, key })
          if (e) return setErr(e)
          saveSyncConfig({ url, key })
          window.location.reload()
        }}
      >
        Relier le serveur
      </Button>
      <Button
        full
        onClick={() => {
          try {
            window.localStorage.setItem(LOCAL_MODE_KEY, '1')
          } catch {
            /* facultatif */
          }
          window.location.reload()
        }}
      >
        Continuer sans compte
      </Button>
    </div>
  )
}
