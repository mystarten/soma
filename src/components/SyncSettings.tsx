import { useEffect, useMemo, useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import { Badge, Button, Card, Field, Segmented, TextInput, useToast } from '../components/ui/primitives'
import {
  SYNC_CONFIGURED,
  SYNC_FROM_BROWSER,
  clearSyncConfig,
  currentSyncConfig,
  parseShared,
  saveSyncConfig,
  shareLink,
  validateSyncConfig,
} from '../sync/supabase'
import schemaSql from '../../supabase/schema.sql?raw'
import { currentEmail, restoreFromCloud, sendMagicLink, signInWithPassword, signOut, signUpWithPassword, syncNow, verifyEmailCode } from '../sync/syncEngine'

export default function SyncSettings({ param }: { param?: string }) {
  const data = useSoma()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'code'>('password')
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const toast = useToast()

  useMemo(() => {
    void currentEmail().then(setCurrent)
  }, [data.syncState])

  /* Lien reçu depuis l'autre appareil : on enregistre la configuration et on recharge. */
  useEffect(() => {
    const shared = param ? parseShared(param) : null
    if (!shared || SYNC_CONFIGURED) return
    if (validateSyncConfig(shared)) return
    saveSyncConfig(shared)
    window.location.hash = '#/reglages'
    window.location.reload()
  }, [param])

  if (!SYNC_CONFIGURED) {
    const appUrl = `${window.location.origin}${window.location.pathname}`
    const save = () => {
      const c = { url: url.trim(), key: key.trim() }
      const err = validateSyncConfig(c)
      if (err) return setFormError(err)
      saveSyncConfig(c)
      window.location.reload()
    }
    return (
      <Card title="Synchronisation entre appareils" subtitle="Désactivée : tout reste sur cet appareil">
        {toast.node}
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-mist-300">
          <li>
            Crée un compte gratuit sur <span className="text-mist-100">supabase.com</span>, puis{' '}
            <span className="text-mist-100">New project</span> (donne-lui un nom et un mot de passe, choisis la région la plus proche).
          </li>
          <li>
            Dans ton projet : <span className="text-mist-100">SQL Editor</span> → <span className="text-mist-100">New query</span> → colle le texte ci-dessous → <span className="text-mist-100">Run</span>.
            <div className="mt-1.5">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(schemaSql)
                    toast.show('Texte copié')
                  } catch {
                    toast.show('Copie impossible : sélectionne le texte à la main')
                  }
                }}
              >
                Copier le texte à coller
              </Button>
            </div>
          </li>
          <li>
            <span className="text-mist-100">Authentication → URL Configuration</span> : dans « Site URL » et « Redirect URLs », mets{' '}
            <code className="break-all text-accent">{appUrl}</code>
          </li>
          <li>
            <span className="text-mist-100">Project Settings → API</span> : copie « Project URL » et la clé{' '}
            <span className="text-mist-100">anon public</span> (jamais la clé « service_role »), puis colle-les ici.
          </li>
        </ol>
        <div className="mt-3 space-y-2">
          <Field label="Project URL">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoComplete="off" />
          </Field>
          <Field label="Clé anon public">
            <TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJ…" autoComplete="off" />
          </Field>
          <Button variant="primary" full onClick={save} disabled={!url.trim() || !key.trim()}>
            Activer la synchronisation
          </Button>
          {formError && <p className="text-xs text-[#ff8f8f]">{formError}</p>}
          <p className="text-[0.68rem] text-mist-700">
            Ces deux valeurs restent dans ton navigateur. Elles sont publiques par nature : tes données sont protégées par ton
            compte et par les règles de la base.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Synchronisation" subtitle="Connexion par lien magique, sans mot de passe">
      {toast.node}
      <div className="mt-2 text-xs text-mist-500">
        État :{' '}
        <span className="text-mist-100">
          {data.syncState.kind === 'idle'
            ? `synchronisé${data.syncState.pending ? ` (${data.syncState.pending} en attente)` : ''}`
            : data.syncState.kind === 'syncing'
              ? 'synchronisation en cours'
              : data.syncState.kind === 'error'
                ? data.syncState.message
                : 'non connecté'}
        </span>
      </div>

      {current ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge color="#41e08a">{current}</Badge>
          <Button
            onClick={async () => {
              await syncNow()
              toast.show('Synchronisation lancée')
            }}
          >
            Synchroniser maintenant
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut()
              setCurrent(null)
            }}
          >
            Se déconnecter
          </Button>
          <div className="mt-2 w-full rounded-xl bg-white/4 p-3 text-xs hairline">
            <p className="text-mist-300">
              <span className="font-medium text-mist-100">Appareil neuf ?</span> Si tes vraies données sont sur un autre appareil
              (déjà synchronisé), récupère-les ici : les données de cet appareil-ci sont remplacées par celles du cloud.
            </p>
            {confirmRestore ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[#ffb02e]">Remplacer les données de cet appareil ?</span>
                <Button
                  variant="danger"
                  onClick={async () => {
                    setError(null)
                    try {
                      await restoreFromCloud()
                      window.location.reload()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Récupération impossible')
                      setConfirmRestore(false)
                    }
                  }}
                >
                  Oui, récupérer
                </Button>
                <Button onClick={() => setConfirmRestore(false)}>Annuler</Button>
              </div>
            ) : (
              <Button className="mt-2" onClick={() => setConfirmRestore(true)}>
                Récupérer mes données du cloud
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Field label="Adresse e-mail">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="moi@exemple.fr"
              autoComplete="email"
            />
          </Field>
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as 'password' | 'code')}
            options={[
              { value: 'password', label: 'Mot de passe' },
              { value: 'code', label: 'Code par e-mail' },
            ]}
            size="sm"
          />
          {mode === 'password' && (
            <>
              <Field label="Mot de passe" hint="Au moins 6 caractères. Première fois : crée-le ici, il sert ensuite à te reconnecter.">
                <TextInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={!email.includes('@') || password.length < 6}
                  onClick={async () => {
                    setError(null)
                    try {
                      await signInWithPassword(email.trim(), password)
                      window.location.reload()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Connexion refusée')
                    }
                  }}
                >
                  Me connecter
                </Button>
                <Button
                  disabled={!email.includes('@') || password.length < 6}
                  onClick={async () => {
                    setError(null)
                    try {
                      await signUpWithPassword(email.trim(), password)
                      window.location.reload()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Création impossible')
                    }
                  }}
                >
                  Créer mon compte
                </Button>
              </div>
            </>
          )}
          {mode === 'code' && (
            <>
          <Button
            variant="primary"
            onClick={async () => {
              setError(null)
              try {
                await sendMagicLink(email.trim())
                setSent(true)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Envoi impossible')
              }
            }}
            disabled={!email.includes('@')}
          >
            Recevoir mon code par e-mail
          </Button>
          {sent && (
            <div className="space-y-2 rounded-xl bg-white/4 p-3 hairline">
              <p className="text-xs text-[#41e08a]">
                Code envoyé à {email}. Recopie les 6 chiffres du mail ici.
              </p>
              <div className="flex gap-2">
                <TextInput
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  aria-label="Code à 6 chiffres"
                />
                <Button
                  variant="primary"
                  disabled={code.replace(/\s/g, '').length < 6}
                  onClick={async () => {
                    setError(null)
                    try {
                      await verifyEmailCode(email.trim(), code)
                      setSent(false)
                      setCode('')
                      window.location.reload()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Code refusé')
                    }
                  }}
                >
                  Valider
                </Button>
              </div>
              <button className="text-xs text-mist-500 underline" onClick={() => setSent(false)}>
                Renvoyer un code
              </button>
            </div>
          )}
            </>
          )}
          {error && <p className="text-xs text-[#ff8f8f]">{error}</p>}
        </div>
      )}
      {SYNC_FROM_BROWSER && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
          <Button
            onClick={async () => {
              const c = currentSyncConfig()
              if (!c) return
              try {
                await navigator.clipboard.writeText(shareLink(c))
                toast.show('Lien copié : ouvre-le sur ton téléphone')
              } catch {
                toast.show('Copie impossible')
              }
            }}
          >
            Copier le lien pour mon téléphone
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearSyncConfig()
              window.location.reload()
            }}
          >
            Retirer la configuration
          </Button>
        </div>
      )}
    </Card>
  )
}

/* ── Éditeurs ───────────────────────────────────────────────────────── */
