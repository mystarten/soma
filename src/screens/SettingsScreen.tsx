import { useRef, useState } from 'react'
import SyncSettings from '../components/SyncSettings'
import StoragePanel from '../components/StoragePanel'
import { Button, Card, useToast } from '../components/ui/primitives'
import { exportBackup, importBackup, wipeData } from '../db/repo'
import { todayKey } from '../engine/time'

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Réglages réduits à l'essentiel : synchronisation, sauvegarde et santé du stockage. */
export default function SettingsScreen({ param }: { param?: string }) {
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {toast.node}
      <SyncSettings param={param} />
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
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Supprimer toutes mes données sur cet appareil ?')) return
              await wipeData()
              toast.show('Données supprimées')
            }}
          >
            Tout supprimer
          </Button>
        </div>
      </Card>
      <StoragePanel />
    </div>
  )
}
