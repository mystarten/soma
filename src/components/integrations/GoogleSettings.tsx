import { useState } from 'react'
import { Button, Card, Field, TextInput } from '../ui/primitives'
import { getClientId, setClientId, validateClientId } from '../../integrations/google'
import { connectGoogle, disconnectGoogle, notifyConfigChanged, useGoogle } from '../../integrations/useGoogle'

/** Réglages → Google : pas à pas pour créer son propre accès, puis connexion en lecture seule. */
export default function GoogleSettings() {
  const g = useGoogle()
  const [id, setId] = useState(getClientId())
  const [err, setErr] = useState<string | null>(null)
  const origin = window.location.origin

  const save = () => {
    const e = validateClientId(id)
    setErr(e)
    if (e) return
    setClientId(id)
    notifyConfigChanged()
  }

  return (
    <Card title="Google · Agenda et mails" subtitle={g.connected ? 'Connecté, en lecture seule' : 'Lecture seule : l’app ne peut rien écrire, envoyer ni supprimer'}>
      {!g.configured && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-mist-300">
          <li>
            Va sur <span className="text-mist-100">console.cloud.google.com</span> et crée un projet (nom au choix).
          </li>
          <li>
            <span className="text-mist-100">APIs et services → Bibliothèque</span> : active <span className="text-mist-100">Google Calendar API</span> puis{' '}
            <span className="text-mist-100">Gmail API</span>.
          </li>
          <li>
            <span className="text-mist-100">Écran de consentement OAuth</span> : type « Externe », un nom d’app, ton adresse e-mail. Ajoute ton adresse dans{' '}
            <span className="text-mist-100">Utilisateurs de test</span>. Ajoute les portées <code>calendar.readonly</code> et <code>gmail.readonly</code>.
          </li>
          <li>
            <span className="text-mist-100">Identifiants → Créer des identifiants → ID client OAuth → Application Web</span>. Dans « Origines JavaScript autorisées »
            mets <code className="break-all text-accent">{origin}</code> (et <code>http://localhost:4173</code> si tu l’utilises en local). Copie l’ID client.
          </li>
          <li>Colle l’ID client ci-dessous, puis connecte-toi. Google affichera « application non validée » : c’est normal, c’est ton propre accès.</li>
        </ol>
      )}
      <div className="mt-3 space-y-2">
        <Field label="ID client Google" hint="Public par nature : ce n’est pas un secret. Il reste dans ce navigateur.">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="123456-abcdef.apps.googleusercontent.com" autoComplete="off" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!id.trim()}>
            Enregistrer
          </Button>
          <Button variant="primary" onClick={() => void connectGoogle()} disabled={!g.configured}>
            {g.connected ? 'Se reconnecter' : 'Se connecter à Google'}
          </Button>
          {(g.connected || g.configured) && (
            <Button
              variant="ghost"
              onClick={() => {
                disconnectGoogle()
                setClientId('')
                setId('')
                notifyConfigChanged()
              }}
            >
              Tout retirer
            </Button>
          )}
        </div>
        {err && <p className="text-xs text-[#ff8f8f]">{err}</p>}
        {g.error && <p className="text-xs text-[#ffb02e]">{g.error}</p>}
        <p className="text-[0.68rem] text-mist-700">
          La connexion dure environ une heure : passé ce délai, un tap sur « Se reconnecter » suffit. Les mails et l’agenda restent dans ce navigateur.
        </p>
      </div>
    </Card>
  )
}
