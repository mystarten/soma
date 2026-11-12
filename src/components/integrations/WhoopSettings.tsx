import { useEffect, useState } from 'react'
import { Button, Card, useToast } from '../ui/primitives'
import { SYNC_CONFIGURED } from '../../sync/supabase'
import { useSoma } from '../../hooks/useSoma'
import { readWhoopLast, redirectUri, whoopConnected, whoopDisconnect, whoopStart, whoopSync, type WhoopLast } from '../../integrations/whoop'
import functionCode from '../../../supabase/functions/whoop/index.ts?raw'
import tokensSql from '../../../supabase/whoop.sql?raw'

/** Réglages → WHOOP : connexion par l'API officielle, via une petite fonction Supabase. */
export default function WhoopSettings() {
  const data = useSoma()
  const toast = useToast()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<WhoopLast | null>(readWhoopLast)
  const signedIn = SYNC_CONFIGURED && data.syncState.kind !== 'signed-out' && data.syncState.kind !== 'disabled'

  useEffect(() => {
    if (!signedIn) return
    whoopConnected().then(setConnected).catch(() => setConnected(false))
  }, [signedIn])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec.')
    } finally {
      setBusy(false)
    }
  }
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.show(`${what} copié`)
    } catch {
      toast.show('Copie impossible')
    }
  }

  return (
    <Card title="WHOOP · connexion directe" subtitle={connected ? 'Connecté : sommeil, récupération, strain et séances' : 'Récupère tout automatiquement, sans export'}>
      {toast.node}
      {!signedIn ? (
        <p className="mt-2 text-xs text-mist-300">
          La connexion WHOOP passe par ta base Supabase : active d’abord la synchronisation et connecte-toi (carte « Synchronisation » ci-dessus).
        </p>
      ) : connected ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await whoopSync(30)
                setLast(readWhoopLast())
                toast.show(`${r.days} jours (dont ${r.withRecovery} avec récupération) et ${r.workouts} séances ajoutés`)
                if (r.received.recovery === 0) {
                  setError('WHOOP n’a renvoyé aucune récupération : vérifie que l’accès « recovery » est bien coché dans ton application WHOOP, puis reconnecte-la.')
                }
              })
            }
          >
            {busy ? 'Récupération…' : 'Récupérer les 30 derniers jours'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => run(async () => { await whoopDisconnect(); setConnected(false) })}>
            Déconnecter WHOOP
          </Button>
          <p className="w-full text-[0.68rem] text-mist-500">
            Récupération automatique chaque jour à partir de 10 h, à l’ouverture de l’app (puis toutes les 20 minutes tant qu’elle est ouverte, jusqu’à ce que la récupération du jour arrive).
          </p>
          {last && (
            <p className="w-full rounded-lg bg-white/4 px-2.5 py-2 text-[0.68rem] text-mist-300 hairline">
              Dernière récupération : {new Date(last.at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · reçu de WHOOP : {last.received.recovery} récupération{last.received.recovery > 1 ? 's' : ''}, {last.received.sleep} nuit{last.received.sleep > 1 ? 's' : ''}, {last.received.cycles} cycle{last.received.cycles > 1 ? 's' : ''}, {last.received.workouts} séance{last.received.workouts > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      ) : (
        <>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-mist-300">
            <li>
              Sur <span className="text-mist-100">developer-dashboard.whoop.com</span> : crée une application. Dans « Redirect URLs » mets{' '}
              <code className="break-all text-accent">{redirectUri()}</code> et coche les accès recovery, cycles, sleep, workout, profile.
            </li>
            <li>
              Dans Supabase → <span className="text-mist-100">SQL Editor</span> : colle et lance ce texte.{' '}
              <button className="text-accent underline" onClick={() => void copy(tokensSql, 'Texte SQL')}>Copier</button>
            </li>
            <li>
              Supabase → <span className="text-mist-100">Edge Functions → Deploy a new function → Via Editor</span> : nom <code>whoop</code>, colle ce code, Deploy.{' '}
              <button className="text-accent underline" onClick={() => void copy(functionCode, 'Code')}>Copier le code</button>
            </li>
            <li>
              Edge Functions → <span className="text-mist-100">Secrets</span> : ajoute <code>WHOOP_CLIENT_ID</code> et <code>WHOOP_CLIENT_SECRET</code> (les deux valeurs de ton application WHOOP). Ces valeurs restent chez Supabase, jamais dans l’app.
            </li>
            <li>Reviens ici et touche « Connecter WHOOP ».</li>
          </ol>
          <Button variant="primary" className="mt-3" disabled={busy} onClick={() => run(whoopStart)}>
            Connecter WHOOP
          </Button>
        </>
      )}
      {error && <p className="mt-2 text-xs text-[#ffb02e]">{error}</p>}
    </Card>
  )
}
