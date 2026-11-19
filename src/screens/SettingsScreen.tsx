import { useRef, useState } from 'react'
import SyncSettings from '../components/SyncSettings'
import { useSoma } from '../hooks/useSoma'
import { signOut, syncNow } from '../sync/syncEngine'
import { SYNC_CONFIGURED } from '../sync/supabase'
import { displayName } from '../sync/username'
import StoragePanel from '../components/StoragePanel'
import JsonTools from '../components/JsonTools'
import { Button, Card, useToast } from '../components/ui/primitives'
import { exportBackup, importBackup, saveSettings } from '../db/repo'
import { Segmented } from '../components/ui/primitives'
import { programStartDay } from '../engine/todayPlan'
import { todayKey } from '../engine/time'

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Début du programme et rythme de repos. */
function ProgramCard() {
  const data = useSoma()
  const s = data.settings
  const fromFile = data.program ? programStartDay(data.program) : null
  return (
    <Card title="Mon programme" subtitle="Sert à calculer la semaine en cours">
      <div className="mt-3 flex flex-col gap-3">
        <label className="text-xs text-mist-300">
          Début du programme (lundi de la semaine 1)
          <input
            type="date"
            value={s.programStart ?? fromFile ?? ''}
            onChange={(e) => void saveSettings({ programStart: e.target.value || undefined })}
            className="mt-1 block min-h-12 w-full rounded-xl bg-ink-900/70 px-3.5 text-base text-mist-100 hairline outline-none"
          />
        </label>
        <p className="text-xs text-mist-500">
          {s.programStart ? 'Date choisie par toi.' : fromFile ? 'Date lue dans ton programme.' : 'Aucune date : choisis-en une.'}{' '}
          {s.programStart && fromFile && s.programStart !== fromFile && (
            <button className="text-accent underline" onClick={() => void saveSettings({ programStart: undefined })}>
              Revenir à la date du programme ({fromFile.slice(8, 10)}/{fromFile.slice(5, 7)})
            </button>
          )}
        </p>
        <div className="flex items-center justify-between gap-3 border-t border-white/6 pt-3">
          <span className="text-xs text-mist-300">Repos conseillé après</span>
          <Segmented value={String(s.restEvery === 2 ? 2 : 3)} onChange={(v) => void saveSettings({ restEvery: Number(v) })} options={[{ value: '2', label: '2 jours' }, { value: '3', label: '3 jours' }]} size="sm" />
        </div>
      </div>
    </Card>
  )
}

function AccountCard() {
  const { syncState } = useSoma()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const email = 'email' in syncState ? syncState.email : ''
  return (
    <Card title="Mon compte" subtitle="Tes programmes sont enregistrés dans ton compte et suivent sur tous tes appareils">
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-mist-100">{email ? displayName(email) : 'Non connecté'}</p>
        <p className="text-xs text-mist-500">
          {syncState.kind === 'idle' ? `Synchronisé${syncState.pending ? ` · ${syncState.pending} modification(s) en attente` : ''}` : syncState.kind === 'syncing' ? 'Synchronisation…' : syncState.kind === 'error' ? `En attente : ${syncState.message}` : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await syncNow()
              setBusy(false)
              toast.show('Synchronisé')
            }}
          >
            Synchroniser maintenant
          </Button>
          {SYNC_CONFIGURED && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm('Se déconnecter ? Tes programmes restent dans ton compte, mais ne seront plus affichés sur cet appareil.')) return
                await signOut()
              }}
            >
              Se déconnecter
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Réglages réduits à l'essentiel : synchronisation, sauvegarde et santé du stockage. */
export default function SettingsScreen({ param }: { param?: string }) {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {toast.node}
      <ProgramCard />
      <AccountCard />
      {SYNC_CONFIGURED && (
        <details className="rounded-[var(--radius-card)] p-4 hairline" open={!!param}>
          <summary className="cursor-pointer text-sm text-mist-300">Serveur (réglages avancés)</summary>
          <div className="mt-3">
            <SyncSettings param={param} />
          </div>
        </details>
      )}
      <JsonTools />
      <Card title="Mes données" subtitle="Sauvegarde et restauration">
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              download(`soma-sauvegarde-${todayKey()}.json`, JSON.stringify(await exportBackup(), null, 2))
              toast.show('Sauvegarde téléchargée')
            }}
          >
            Exporter (JSON)
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setBusy(true)
              try {
                await importBackup(JSON.parse(await f.text()), 'merge')
                toast.show('Sauvegarde importée')
              } catch {
                toast.show('Fichier illisible')
              }
              setBusy(false)
              if (file.current) file.current.value = ''
            }}
          />
          <Button disabled={busy} onClick={() => file.current?.click()}>Importer (JSON)</Button>
        </div>
      </Card>
      <StoragePanel />
    </div>
  )
}
