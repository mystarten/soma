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
import { planSettings } from '../engine/plan'

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

const DOW_OPTIONS = [
  { value: '-1', label: 'Aucun' },
  { value: '1', label: 'Lundi' },
  { value: '2', label: 'Mardi' },
  { value: '3', label: 'Mercredi' },
  { value: '4', label: 'Jeudi' },
  { value: '5', label: 'Vendredi' },
  { value: '6', label: 'Samedi' },
  { value: '0', label: 'Dimanche' },
]

/** Réglages du plan : ordre de rotation du street, sorties de course, jours de la natation et du VTT. */
function PlanSettingsCard() {
  const data = useSoma()
  const s = data.settings
  const ps = planSettings(s, data.program)
  const move = (i: number, d: -1 | 1) => {
    const next = [...ps.order]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    void saveSettings({ planStreetOrder: next })
  }
  return (
    <Card title="Mon plan" subtitle="Ordre des séances de street, course, natation et VTT">
      <div className="mt-3 flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs text-mist-300">Ordre du street workout (la suivante est toujours celle qui vient après la dernière faite)</p>
          <ol className="flex flex-col gap-1.5">
            {ps.order.map((c, i) => (
              <li key={c} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5 hairline">
                <span className="w-6 text-xs text-mist-500 tnum">{i + 1}</span>
                <span className="min-w-0 flex-1 text-sm text-mist-100"><b className="text-accent">{c}</b> {data.program?.sessions.find((x) => x.code === c)?.title}</span>
                <button aria-label={`Monter ${c}`} disabled={i === 0} onClick={() => move(i, -1)} className="grid h-11 w-11 place-items-center rounded-lg bg-white/6 text-mist-100 disabled:opacity-30">▲</button>
                <button aria-label={`Descendre ${c}`} disabled={i === ps.order.length - 1} onClick={() => move(i, 1)} className="grid h-11 w-11 place-items-center rounded-lg bg-white/6 text-mist-100 disabled:opacity-30">▼</button>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-mist-300">Sorties de course par semaine (semaines 7 à 10)</span>
          <Segmented value={String(ps.runsPerWeek)} onChange={(v) => void saveSettings({ planRunsPerWeek: v === '2' ? 2 : 3 })} options={[{ value: '2', label: '2' }, { value: '3', label: '3' }]} size="sm" />
        </div>
        <label className="text-xs text-mist-300">
          Natation (jour habituel)
          <select value={String(ps.natationDow)} onChange={(e) => void saveSettings({ planNatationDow: Number(e.target.value) })} className="mt-1 block min-h-12 w-full rounded-xl bg-ink-900/70 px-3.5 text-base text-mist-100 hairline outline-none">
            {DOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-mist-300">
          VTT (jour habituel)
          <select value={String(ps.veloDow)} onChange={(e) => void saveSettings({ planVeloDow: Number(e.target.value) })} className="mt-1 block min-h-12 w-full rounded-xl bg-ink-900/70 px-3.5 text-base text-mist-100 hairline outline-none">
            {DOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
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
      <PlanSettingsCard />
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
