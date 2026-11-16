import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { ExerciseReference } from '../../types'
import { DEFAULT_RECORD_ROWS, isWeighted, type RecordKind } from '../../engine/records'
import { exerciseRecords } from '../../engine/load'
import { fmtClock } from '../../engine/time'
import { saveExercise, saveSettings } from '../../db/repo'
import { uid } from '../../db/db'
import { RUN_5K_REFERENCE_ID } from '../../db/seed'
import { Button, Card, Field, Segmented, Select, Sheet, Stepper, TextInput } from '../ui/primitives'

/** Mes records : modifiables à la main. Ils servent de référence au calcul de l'effort et du 1RM. */
export default function RecordsEditor() {
  const data = useSoma()
  const refs = data.settings.references
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customKind, setCustomKind] = useState<'reps' | 'static'>('reps')

  const rows = useMemo(() => {
    const known = new Map(DEFAULT_RECORD_ROWS.map((r) => [r.id, r]))
    const extra = refs
      .filter((r) => !known.has(r.exerciseId))
      .map((r) => {
        const ex = data.exercises.find((e) => e.id === r.exerciseId)
        return { id: r.exerciseId, label: ex?.name ?? r.exerciseId, kind: (ex?.kind === 'static' ? 'hold' : 'reps') as RecordKind }
      })
    return [...DEFAULT_RECORD_ROWS, ...extra]
  }, [refs, data.exercises])

  const valueText = (id: string, kind: RecordKind) => {
    const r = refs.find((x) => x.exerciseId === id)
    if (!r) return null
    if (kind === 'time') return r.holdSec ? fmtClock(r.holdSec) : null
    if (kind === 'hold') return r.holdSec ? `${r.holdSec} s` : null
    if (!r.reps) return null
    return `${r.reps} rep${r.reps > 1 ? 's' : ''}${r.loadKg ? ` à +${r.loadKg} kg` : ''}`
  }
  const seen = (id: string) => {
    const ex = data.exercises.find((e) => e.id === id)
    if (!ex) return null
    const rec = exerciseRecords(id, data.workouts, data.loadCtx)
    if (ex.kind === 'static') return rec.maxHoldSec ? `${rec.maxHoldSec} s` : null
    return rec.maxReps ? `${rec.maxReps} reps${rec.maxLoadKg ? ` · lest max +${rec.maxLoadKg} kg` : ''}` : null
  }

  const save = async (next: ExerciseReference[]) => saveSettings({ references: next })

  return (
    <Card
      title="Mes records"
      subtitle="Touche une ligne pour la modifier. Ils servent à calibrer ton effort et ton 1RM."
      action={
        <Button className="px-2.5 py-1.5 text-[0.7rem]" onClick={() => setAdding(true)}>
          + Ajouter
        </Button>
      }
    >
      <ul className="mt-2 divide-y divide-white/6">
        {rows.map((r) => {
          const v = valueText(r.id, r.kind)
          const s = seen(r.id)
          return (
            <li key={r.id}>
              <button onClick={() => setEditing(r.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-mist-100">{r.label}</span>
                  {s && <span className="block truncate text-[0.66rem] text-mist-500">Dans tes séances : {s}</span>}
                </span>
                <span className={`shrink-0 text-sm tnum ${v ? 'font-medium text-accent' : 'text-mist-700'}`}>{v ?? 'à renseigner'}</span>
                <span className="shrink-0 text-xs text-mist-500" aria-hidden>
                  ✎
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {editing && (
        <RecordSheet
          id={editing}
          rows={rows}
          current={refs.find((x) => x.exerciseId === editing)}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            await save([...refs.filter((x) => x.exerciseId !== editing), r])
            setEditing(null)
          }}
          onRemove={async () => {
            await save(refs.filter((x) => x.exerciseId !== editing))
            setEditing(null)
          }}
        />
      )}
      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="Ajouter un record">
          <div className="space-y-3 pb-2">
            <Field label="Exercice">
              <Select
                value=""
                onChange={(v) => {
                  if (!v) return
                  setAdding(false)
                  setEditing(v)
                }}
                options={[{ value: '', label: 'Choisir…' }, ...data.exercises.filter((e) => !e.archived && !rows.some((r) => r.id === e.id)).map((e) => ({ value: e.id, label: e.name }))]}
              />
            </Field>
            <div className="rounded-xl bg-white/4 p-3 hairline">
              <p className="mb-2 text-xs font-medium text-mist-300">Ou crée ton propre record</p>
              <div className="space-y-2">
                <TextInput value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ex. Traction à une main, 100 m nage…" />
                <Segmented value={customKind} onChange={setCustomKind} options={[{ value: 'reps', label: 'Répétitions' }, { value: 'static', label: 'Tenue (secondes)' }]} />
                <Button
                  variant="primary"
                  disabled={customName.trim().length < 2}
                  onClick={async () => {
                    const id = uid('ex')
                    await saveExercise({
                      id,
                      name: customName.trim(),
                      kind: customKind === 'static' ? 'static' : 'bodyweight',
                      unit: customKind === 'static' ? 'seconds' : 'reps',
                      group: 'Perso',
                      mix: {},
                      updatedAt: new Date().toISOString(),
                    })
                    setCustomName('')
                    setAdding(false)
                    setEditing(id)
                  }}
                >
                  Créer et renseigner
                </Button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </Card>
  )
}

function RecordSheet({
  id,
  rows,
  current,
  onClose,
  onSave,
  onRemove,
}: {
  id: string
  rows: { id: string; label: string; kind: RecordKind }[]
  current?: ExerciseReference
  onClose: () => void
  onSave: (r: ExerciseReference) => void | Promise<void>
  onRemove: () => void | Promise<void>
}) {
  const data = useSoma()
  const ex = data.exercises.find((e) => e.id === id)
  const row = rows.find((r) => r.id === id)
  const kind: RecordKind = id === RUN_5K_REFERENCE_ID ? 'time' : (row?.kind ?? (ex?.kind === 'static' ? 'hold' : 'reps'))
  const [reps, setReps] = useState(current?.reps ?? 0)
  const [load, setLoad] = useState(current?.loadKg ?? 0)
  const [hold, setHold] = useState(current?.holdSec ?? (kind === 'time' ? 1200 : 0))
  const weighted = isWeighted(id) || ex?.kind === 'weighted'
  return (
    <Sheet
      open
      onClose={onClose}
      title={row?.label ?? ex?.name ?? 'Record'}
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            onClick={() =>
              void onSave({ exerciseId: id, ...(kind === 'reps' ? { reps, loadKg: weighted ? load : undefined } : { holdSec: hold }) })
            }
          >
            Enregistrer
          </Button>
          {current && (
            <Button variant="danger" onClick={() => void onRemove()}>
              Retirer
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        {kind === 'reps' && (
          <>
            <Field label="Répétitions max">
              <Stepper value={reps} onChange={setReps} min={0} max={500} suffix="reps" />
            </Field>
            {weighted && (
              <Field label="Lest">
                <Stepper value={load} onChange={setLoad} min={0} max={200} step={0.5} precision={1} suffix="kg" />
              </Field>
            )}
          </>
        )}
        {kind === 'hold' && (
          <Field label="Tenue max">
            <Stepper value={hold} onChange={setHold} min={0} max={900} suffix="s" />
          </Field>
        )}
        {kind === 'time' && (
          <Field label="Temps (minutes puis secondes)" hint={`Soit ${fmtClock(hold)}`}>
            <div className="grid grid-cols-2 gap-2">
              <Stepper value={Math.floor(hold / 60)} onChange={(m) => setHold(m * 60 + (hold % 60))} min={5} max={120} suffix="min" />
              <Stepper value={hold % 60} onChange={(s) => setHold(Math.floor(hold / 60) * 60 + s)} min={0} max={59} suffix="s" />
            </div>
          </Field>
        )}
      </div>
    </Sheet>
  )
}
