import { useEffect, useState } from 'react'
import { Button, Card } from './ui/primitives'
import { IconTitle } from './ui/PageHero'
import { freeSpace, storageReport, writeTest, type StorageReport } from '../db/maintenance'
import { exportBackup } from '../db/repo'
import { APP_VERSION, getBackupJson, listBackups, type AutoBackup } from '../db/backup'
import { resetEverything } from '../sync/syncEngine'

/** Santé de l'appli sur cet appareil : place disponible, file de synchronisation, dernière récupération WHOOP. */
export default function StoragePanel() {
  const [r, setR] = useState<StorageReport | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [backups, setBackups] = useState<AutoBackup[]>([])
  useEffect(() => void listBackups().then(setBackups), [])
  const [test, setTest] = useState<{ label: string; ok: boolean; detail: string }[] | null>(null)
  const refresh = () => void storageReport().then(setR)
  useEffect(refresh, [])
  const pct = r?.ratio === null || r?.ratio === undefined ? null : Math.round(r.ratio * 100)
  return (
    <Card title={<IconTitle icon="database">Stockage et santé</IconTitle>} subtitle="Ce qu’occupe Soma sur cet appareil">
      {r && (
        <ul className="mt-3 space-y-1.5 text-xs text-mist-300">
          <li className="flex justify-between gap-3"><span>Place utilisée par Soma</span><span className="tnum text-mist-100">{r.usageMB === null ? 'inconnue' : `${r.usageMB} Mo${r.quotaMB ? ` sur ${r.quotaMB} Mo` : ''}${pct !== null ? ` (${pct} %)` : ''}`}</span></li>
          {r.rows.map((x) => (
            <li key={x.label} className="flex justify-between gap-3"><span>{x.label}</span><span className="tnum text-mist-100">{x.count}</span></li>
          ))}
          <li className="flex justify-between gap-3"><span>Modifications en attente de synchronisation</span><span className="tnum text-mist-100">{r.queue}</span></li>
          <li className="flex justify-between gap-3"><span>Version de l’appli</span><span className="tnum text-mist-100">v{APP_VERSION} · {__BUILD_DATE__}</span></li>

        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            try {
              for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister()
              for (const k of await caches.keys()) await caches.delete(k)
            } catch {
              /* facultatif */
            }
            window.location.reload()
          }}
        >
          Mettre à jour l’appli
        </Button>
        <Button
          onClick={async () => {
            const x = await freeSpace()
            setMsg(`File de synchronisation : ${x.queueBefore} → ${x.queueAfter}.`)
            refresh()
          }}
        >
          Libérer de l’espace
        </Button>
        <Button onClick={async () => { setTest([]); await writeTest(setTest) }}>Tester l’écriture</Button>
        {msg && <span className="text-xs text-mist-300">{msg}</span>}
      </div>
      {test && (
        <ul className="mt-3 space-y-1 text-xs">
          {test.length === 0 && <li className="text-mist-500">Test en cours… (4 secondes maximum par étape)</li>}
          {test.map((t) => (
            <li key={t.label} className="flex justify-between gap-3">
              <span className="text-mist-300">{t.label}</span>
              <span className={t.ok ? 'text-[#41e08a]' : 'text-[#ff8f45]'}>{t.ok ? 'fonctionne' : t.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {backups.length > 0 && (
        <div className="mt-3 rounded-xl bg-white/4 p-3 hairline">
          <p className="text-xs font-medium text-mist-300">Sauvegardes automatiques (avant chaque mise à jour)</p>
          <ul className="mt-1.5 space-y-1.5">
            {backups.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-2 text-xs text-mist-300">
                <span>{new Date(b.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {b.label.replace('->', ' → ')}</span>
                <button
                  className="rounded-lg bg-white/8 px-2.5 py-1.5 text-mist-100"
                  onClick={async () => {
                    const j = await getBackupJson(b.key)
                    if (!j) return
                    const url = URL.createObjectURL(new Blob([j], { type: 'application/json' }))
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `soma-sauvegarde-auto-${b.at.slice(0, 10)}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Télécharger
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 rounded-xl border border-[#ff5a5a]/30 bg-[#ff5a5a]/6 p-3">
        <p className="text-sm font-medium text-mist-100">Repartir de zéro, partout</p>
        <p className="mt-0.5 text-xs text-mist-300">
          Efface toutes tes données (séances, jours, objectifs, programme, fiches, tâches) sur cet appareil <b>et dans le cloud</b>. Les autres appareils connectés les effacent aussi à leur prochaine synchronisation. Ta connexion WHOOP reste en place : les données reviendront depuis WHOOP.
        </p>
        <Button
          variant="danger"
          className="mt-2"
          disabled={resetting}
          onClick={async () => {
            if (!window.confirm('Une sauvegarde va d’abord être téléchargée sur ton ordinateur. Continuer ?')) return
            try {
              const b = await exportBackup()
              const url = URL.createObjectURL(new Blob([JSON.stringify(b)], { type: 'application/json' }))
              const a = document.createElement('a')
              a.href = url
              a.download = `soma-sauvegarde-avant-reset-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
            } catch {
              if (!window.confirm('La sauvegarde a échoué. Effacer quand même ?')) return
            }
            if ((window.prompt('Pour confirmer, écris EFFACER') ?? '').trim().toUpperCase() !== 'EFFACER') return
            setResetting(true)
            try {
              await resetEverything()
              window.location.reload()
            } catch (e) {
              setMsg(`Échec : ${e instanceof Error ? e.message : 'erreur inconnue'}`)
              setResetting(false)
            }
          }}
        >
          {resetting ? 'Remise à zéro…' : 'Tout effacer et repartir de zéro'}
        </Button>
      </div>
      <p className="mt-2 text-[0.68rem] text-mist-500">
        Si ça affiche « sur 0 Mo » ou si l’alerte de stockage revient, c’est que le disque de l’appareil est presque plein : libère de l’espace dessus, rien n’est perdu dans Soma.
      </p>
    </Card>
  )
}
