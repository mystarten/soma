import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import type {
  CardioDetail,
  ExerciseDef,
  IntervalEntry,
  RunDetail,
  RunType,
  SetEntry,
  Workout,
  WorkoutKind,
} from '../types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Segmented,
  Select,
  Sheet,
  Stat,
  Stepper,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '../components/ui/primitives'
import { deleteWorkout, saveWorkout } from '../db/repo'
import { uid } from '../db/db'
import {
  CARDIO_MODALITIES,
  RUN_TYPE_LABEL,
  WORKOUT_KIND_LABEL,
} from '../engine/muscleMap'
import { exerciseRecords, runRecords, workoutLoad } from '../engine/load'
import { fmtClock, fmtPace, parseDay, todayKey } from '../engine/time'
import { estimated1RM, set1RM } from '../engine/strength'
import { navigate } from '../lib/router'

const KINDS: WorkoutKind[] = ['street', 'muscu', 'course', 'cardio', 'abdos', 'mobilite', 'custom']
const RUN_TYPES: RunType[] = ['footing', 'tempo', 'fractionne', 'cotes', 'sortie_longue', 'course', 'test']

function emptyWorkout(kind: WorkoutKind = 'street'): Workout {
  const now = new Date()
  now.setSeconds(0, 0)
  return {
    id: uid('w'),
    day: todayKey(),
    startedAt: now.toISOString(),
    durationMin: 45,
    kind,
    rpe: 7,
    feeling: 3,
    sets: [],
    source: 'manual',
    updatedAt: now.toISOString(),
  }
}

export default function Workouts({ focusId }: { focusId?: string }) {
  const data = useSoma()
  const [tab, setTab] = useState<'journal' | 'modeles' | 'records'>('journal')
  const [editing, setEditing] = useState<Workout | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!focusId) return
    const w = data.workouts.find((x) => x.id === focusId)
    if (w) setEditing(structuredClone(w))
  }, [focusId, data.workouts])

  const byDay = useMemo(() => {
    const map = new Map<string, Workout[]>()
    for (const w of [...data.workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
      const list = map.get(w.day) ?? []
      list.push(w)
      map.set(w.day, list)
    }
    return [...map.entries()]
  }, [data.workouts])

  return (
    <div className="mx-auto w-full max-w-3xl">
      {toast.node}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'journal', label: 'Journal' },
            { value: 'modeles', label: 'Modèles' },
            { value: 'records', label: 'Records' },
          ]}
        />
        <Button variant="primary" onClick={() => setEditing(emptyWorkout())}>
          + Séance
        </Button>
      </div>

      {tab === 'journal' && (
        <div className="flex flex-col gap-3">
          {!byDay.length && (
            <Card>
              <EmptyState
                title="Aucune séance enregistrée"
                hint="Ajoute ta première séance, importe ton export WHOOP, ou génère des données de démo dans Réglages."
                action={
                  <Button variant="primary" className="mt-2" onClick={() => setEditing(emptyWorkout())}>
                    Ajouter une séance
                  </Button>
                }
              />
            </Card>
          )}
          {byDay.map(([day, list]) => (
            <div key={day}>
              <div className="mb-1.5 px-1 text-[0.68rem] tracking-wider text-mist-500 uppercase">
                {format(parseDay(day), 'EEEE d MMMM yyyy', { locale: fr })}
              </div>
              <div className="flex flex-col gap-2">
                {list.map((w) => (
                  <WorkoutRow
                    key={w.id}
                    workout={w}
                    onEdit={() => setEditing(structuredClone(w))}
                    onDuplicate={async () => {
                      const copy: Workout = {
                        ...structuredClone(w),
                        id: uid('w'),
                        day: todayKey(),
                        startedAt: new Date().toISOString(),
                        source: 'manual',
                        externalKey: undefined,
                        sets: w.sets?.map((s) => ({ ...s, id: uid('set') })),
                      }
                      await saveWorkout(copy)
                      toast.show('Séance dupliquée sur aujourd’hui')
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'modeles' && (
        <div className="flex flex-col gap-2">
          {data.templates.map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-mist-100">{t.name}</div>
                  <div className="truncate text-xs text-mist-700">
                    {t.items.length
                      ? t.items
                          .map(
                            (i) =>
                              `${data.exercises.find((e) => e.id === i.exerciseId)?.name ?? '?'} ${i.sets}×${
                                i.reps ?? `${i.holdSec}s`
                              }`,
                          )
                          .join(' · ')
                      : WORKOUT_KIND_LABEL[t.kind]}
                  </div>
                </div>
                <Button
                  onClick={() => {
                    const w = emptyWorkout(t.kind)
                    w.title = t.name
                    w.sets = t.items.flatMap((i) =>
                      Array.from({ length: i.sets }, () => ({
                        id: uid('set'),
                        exerciseId: i.exerciseId,
                        reps: i.reps,
                        holdSec: i.holdSec,
                        loadKg: i.loadKg,
                        restSec: 90,
                      })),
                    )
                    setEditing(w)
                  }}
                >
                  Démarrer
                </Button>
              </div>
            </Card>
          ))}
          <p className="px-2 text-center text-[0.68rem] text-mist-700">
            Les modèles se gèrent dans Réglages → Modèles de séances.
          </p>
        </div>
      )}

      {tab === 'records' && <Records />}

      {editing && (
        <WorkoutEditor
          workout={editing}
          onClose={() => {
            setEditing(null)
            if (focusId) navigate('seances')
          }}
          onSaved={() => toast.show('Séance enregistrée')}
        />
      )}
    </div>
  )
}

/* ── Ligne de séance ─────────────────────────────────────────────────── */

function WorkoutRow({
  workout,
  onEdit,
  onDuplicate,
}: {
  workout: Workout
  onEdit: () => void
  onDuplicate: () => void
}) {
  const data = useSoma()
  const load = workoutLoad(workout, data.loadCtx)
  const setCount = workout.sets?.length ?? 0
  const km = (workout.run?.distanceM ?? workout.cardio?.distanceM ?? 0) / 1000
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-mist-100">
              {workout.title || WORKOUT_KIND_LABEL[workout.kind]}
            </span>
            {workout.source === 'whoop' && <Badge color="#35e3ff">WHOOP</Badge>}
            {workout.source === 'demo' && <Badge>démo</Badge>}
            {workout.planned && <Badge color="#9b7bff">prévue</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-mist-500">
            {format(new Date(workout.startedAt), 'HH:mm')} · {workout.durationMin} min
            {workout.rpe ? ` · RPE ${workout.rpe}` : ''}
            {setCount ? ` · ${setCount} séries` : ''}
            {km > 0.05 ? ` · ${km.toFixed(2)} km` : ''}
          </div>
          {workout.run && (
            <div className="mt-0.5 text-[0.68rem] text-mist-700">
              {RUN_TYPE_LABEL[workout.run.runType]}
              {workout.run.distanceM && workout.run.durationSec
                ? ` · ${fmtPace(workout.run.durationSec / (workout.run.distanceM / 1000))}`
                : ''}
              {workout.run.elevationGainM ? ` · ${workout.run.elevationGainM} m D+` : ''}
            </div>
          )}
          {workout.notes && (
            <div className="mt-1 line-clamp-2 text-[0.68rem] text-mist-700">{workout.notes}</div>
          )}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge color="var(--accent)">{load.toFixed(1)} / 21</Badge>
          <IconButton label="Dupliquer" onClick={onDuplicate} className="h-8 w-8">
            <svg viewBox="0 0 20 20" className="h-4 w-4">
              <rect x="3" y="3" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </IconButton>
        </div>
      </div>
    </Card>
  )
}

/* ── Records ─────────────────────────────────────────────────────────── */

function Records() {
  const data = useSoma()
  const practiced = useMemo(() => {
    const ids = new Set<string>()
    for (const w of data.workouts) for (const s of w.sets ?? []) ids.add(s.exerciseId)
    return data.exercises.filter((e) => ids.has(e.id))
  }, [data.workouts, data.exercises])

  const runs = useMemo(() => runRecords(data.workouts), [data.workouts])
  const projection = useMemo(() => {
    const best = runs.find((r) => r.distanceM === 5000) ?? runs[0]
    if (!best) return null
    return [10000, 21097].map((d) => ({
      label: d === 10000 ? '10 km' : 'Semi',
      sec: best.durationSec * (d / best.distanceM) ** 1.06,
    }))
  }, [runs])

  return (
    <div className="flex flex-col gap-3">
      {!practiced.length && !runs.length && (
        <Card>
          <EmptyState
            title="Pas encore de record"
            hint="Les records se calculent automatiquement à partir de tes séries."
          />
        </Card>
      )}

      {practiced.length > 0 && (
        <Card title="Force & poids du corps" subtitle="Calculés automatiquement">
          <div className="mt-2 space-y-1.5">
            {practiced.map((ex) => {
              const r = exerciseRecords(ex.id, data.workouts, data.loadCtx)
              const rm = estimated1RM(ex, {
                bodyWeightKg: data.bodyWeightKg,
                references: data.settings.references,
              })
              return (
                <div key={ex.id} className="rounded-xl bg-white/4 p-3 hairline">
                  <div className="mb-2 text-sm text-mist-100">{ex.name}</div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {ex.kind === 'static' ? (
                      <Stat label="Tenue max" value={r.maxHoldSec || '—'} unit="s" />
                    ) : (
                      <Stat label="Reps max" value={r.maxReps || '—'} />
                    )}
                    <Stat label="Lest max" value={r.maxLoadKg || '—'} unit="kg" />
                    <Stat
                      label="Volume max"
                      value={r.maxVolumeSession ? Math.round(r.maxVolumeSession) : '—'}
                      unit="kg"
                    />
                    <Stat
                      label="1RM estimé"
                      value={r.best1RM ? Math.round(r.best1RM) : rm ? Math.round(rm) : '—'}
                      unit="kg"
                      hint={r.at ? format(parseDay(r.at), 'd MMM', { locale: fr }) : 'référence'}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {runs.length > 0 && (
        <Card title="Course à pied" subtitle="Meilleurs temps estimés par distance">
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {runs.map((r) => (
              <div key={r.label} className="rounded-xl bg-white/4 p-3 hairline">
                <Stat
                  label={r.label}
                  value={fmtClock(r.durationSec)}
                  hint={format(parseDay(r.day), 'd MMM yyyy', { locale: fr })}
                />
              </div>
            ))}
          </div>
          {projection && (
            <div className="mt-3 rounded-xl bg-accent/8 p-3 text-xs hairline">
              <span className="text-mist-500">Projection (Riegel) · </span>
              {projection.map((p) => (
                <span key={p.label} className="mr-3 text-mist-100">
                  {p.label} ≈ <span className="tnum">{fmtClock(p.sec)}</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

/* ── Éditeur de séance ──────────────────────────────────────────────── */

function WorkoutEditor({
  workout,
  onClose,
  onSaved,
}: {
  workout: Workout
  onClose: () => void
  onSaved: () => void
}) {
  const data = useSoma()
  const [w, setW] = useState<Workout>(workout)
  const patch = (p: Partial<Workout>) => setW((prev) => ({ ...prev, ...p }))

  const kindOptions = useMemo(
    () => [
      ...KINDS.filter((k) => k !== 'custom').map((k) => ({ value: k, label: WORKOUT_KIND_LABEL[k] })),
      ...data.workoutTypes.map((t) => ({ value: `custom:${t.id}`, label: t.name })),
    ],
    [data.workoutTypes],
  )
  const kindValue = w.kind === 'custom' && w.customTypeId ? `custom:${w.customTypeId}` : w.kind
  const customType = data.workoutTypes.find((t) => t.id === w.customTypeId)

  const timeStr = useMemo(() => {
    const d = new Date(w.startedAt)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }, [w.startedAt])

  const setTime = (value: string) => {
    const [h, m] = value.split(':').map(Number)
    const d = parseDay(w.day)
    d.setHours(h || 0, m || 0, 0, 0)
    patch({ startedAt: d.toISOString() })
  }
  const setDay = (day: string) => {
    const d = parseDay(day)
    const prev = new Date(w.startedAt)
    d.setHours(prev.getHours(), prev.getMinutes(), 0, 0)
    patch({ day, startedAt: d.toISOString() })
  }

  const save = async () => {
    await saveWorkout(w)
    onSaved()
    onClose()
  }

  const remove = async () => {
    await deleteWorkout(w.id)
    onClose()
  }

  const load = workoutLoad(w, data.loadCtx)

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={w.title || WORKOUT_KIND_LABEL[w.kind]}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="primary" full onClick={save}>
            Enregistrer
          </Button>
          <Button variant="danger" onClick={remove}>
            Supprimer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type de séance">
            <Select
              value={kindValue}
              onChange={(v) => {
                if (v.startsWith('custom:')) {
                  patch({ kind: 'custom', customTypeId: v.slice(7) })
                } else {
                  patch({ kind: v as WorkoutKind, customTypeId: undefined })
                }
              }}
              options={kindOptions}
            />
          </Field>
          <Field label="Titre" optional>
            <TextInput
              value={w.title ?? ''}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Pull, Push, Fractionné 10×400…"
            />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={w.day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Heure de début" hint="Elle compte : elle pilote la récupération.">
            <TextInput type="time" value={timeStr} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field label="Durée">
            <Stepper
              value={w.durationMin}
              onChange={(v) => patch({ durationMin: v })}
              step={5}
              min={1}
              max={600}
              suffix="min"
            />
          </Field>
          <Field label={`RPE global · ${w.rpe ?? 7}/10`}>
            <Stepper value={w.rpe ?? 7} onChange={(v) => patch({ rpe: v })} min={1} max={10} />
          </Field>
        </div>

        <Field label="Ressenti">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => patch({ feeling: n as 1 | 2 | 3 | 4 | 5 })}
                className={`h-11 flex-1 rounded-xl text-sm transition ${
                  w.feeling === n
                    ? 'bg-accent/20 text-accent shadow-[inset_0_0_0_1px_var(--accent-soft)]'
                    : 'bg-white/5 text-mist-500 hairline'
                }`}
              >
                {['😵', '😕', '😐', '🙂', '🔥'][n - 1]}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2.5 hairline">
          <span className="text-xs text-mist-300">
            Séance prévue (pas encore faite)
          </span>
          <Toggle checked={!!w.planned} onChange={(v) => patch({ planned: v })} label="Séance prévue" />
        </div>

        {/* ── Détails par type ── */}
        {(w.kind === 'street' || w.kind === 'muscu' || w.kind === 'abdos' || w.kind === 'mobilite') && (
          <SetsEditor w={w} patch={patch} />
        )}
        {w.kind === 'course' && <RunEditor w={w} patch={patch} />}
        {w.kind === 'cardio' && <CardioEditor w={w} patch={patch} />}
        {w.kind === 'custom' && customType && (
          <Card title={customType.name} subtitle="Champs personnalisés">
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {customType.fields.map((f) => (
                <Field key={f.id} label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`}>
                  {f.type === 'boolean' ? (
                    <Toggle
                      checked={Boolean(w.customValues?.[f.id])}
                      onChange={(v) => patch({ customValues: { ...w.customValues, [f.id]: v } })}
                      label={f.label}
                    />
                  ) : f.type === 'choice' ? (
                    <Select
                      value={String(w.customValues?.[f.id] ?? f.choices?.[0] ?? '')}
                      onChange={(v) => patch({ customValues: { ...w.customValues, [f.id]: v } })}
                      options={(f.choices ?? []).map((c) => ({ value: c, label: c }))}
                    />
                  ) : f.type === 'number' || f.type === 'duration' ? (
                    <Stepper
                      value={Number(w.customValues?.[f.id] ?? f.min ?? 0)}
                      onChange={(v) => patch({ customValues: { ...w.customValues, [f.id]: v } })}
                      min={f.min ?? 0}
                      max={f.max ?? 999}
                      suffix={f.type === 'duration' ? 'min' : f.unit}
                    />
                  ) : (
                    <TextInput
                      value={String(w.customValues?.[f.id] ?? '')}
                      onChange={(e) =>
                        patch({ customValues: { ...w.customValues, [f.id]: e.target.value } })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </Card>
        )}

        <Field label="Notes" optional>
          <TextArea
            value={w.notes ?? ''}
            onChange={(e) => patch({ notes: (e.target as HTMLTextAreaElement).value })}
            placeholder="Sensations, matériel, météo, détails…"
          />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-accent/8 px-3 py-2.5 text-xs hairline">
          <span className="text-mist-500">Charge estimée de cette séance</span>
          <span className="font-medium text-accent tnum">{load.toFixed(1)} / 21</span>
        </div>
      </div>
    </Sheet>
  )
}

/* ── Séries ──────────────────────────────────────────────────────────── */

function SetsEditor({ w, patch }: { w: Workout; patch: (p: Partial<Workout>) => void }) {
  const data = useSoma()
  const [picker, setPicker] = useState(false)
  const sets = w.sets ?? []

  const grouped = useMemo(() => {
    const out: { exercise: ExerciseDef | undefined; items: SetEntry[] }[] = []
    for (const s of sets) {
      const last = out[out.length - 1]
      if (last && last.items[0]?.exerciseId === s.exerciseId) last.items.push(s)
      else out.push({ exercise: data.exercises.find((e) => e.id === s.exerciseId), items: [s] })
    }
    return out
  }, [sets, data.exercises])

  const update = (id: string, p: Partial<SetEntry>) =>
    patch({ sets: sets.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const removeSet = (id: string) => patch({ sets: sets.filter((s) => s.id !== id) })
  const addSet = (exerciseId: string, copyFrom?: SetEntry) => {
    const ex = data.exercises.find((e) => e.id === exerciseId)
    const base: SetEntry = copyFrom
      ? { ...copyFrom, id: uid('set'), failure: false }
      : {
          id: uid('set'),
          exerciseId,
          reps: ex?.kind === 'static' ? undefined : 10,
          holdSec: ex?.kind === 'static' ? 30 : undefined,
          restSec: 90,
        }
    patch({ sets: [...sets, base] })
  }

  return (
    <Card title="Exercices & séries" action={<Button onClick={() => setPicker(true)}>+ Exercice</Button>}>
      <div className="mt-3 space-y-3">
        {!grouped.length && (
          <p className="py-3 text-center text-xs text-mist-700">
            Ajoute un exercice depuis la bibliothèque.
          </p>
        )}
        {grouped.map((g, gi) => {
          const ex = g.exercise
          const isStatic = ex?.kind === 'static'
          return (
            <div key={gi} className="rounded-xl bg-white/4 p-3 hairline">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-mist-100">{ex?.name ?? 'Exercice'}</div>
                  <div className="text-[0.65rem] text-mist-700">
                    {ex?.group}
                    {ex?.referenceReps ? ` · réf. ${ex.referenceReps} reps` : ''}
                    {ex?.referenceHoldSec ? ` · réf. ${ex.referenceHoldSec} s` : ''}
                  </div>
                </div>
                <Button
                  className="px-2.5 py-1.5 text-[0.7rem]"
                  onClick={() => addSet(g.items[0].exerciseId, g.items[g.items.length - 1])}
                >
                  Même série
                </Button>
              </div>
              <div className="space-y-1.5">
                {g.items.map((s, i) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-5 shrink-0 text-[0.68rem] text-mist-700 tnum">{i + 1}</span>
                    {isStatic ? (
                      <label className="flex min-w-[6.5rem] flex-1 items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1.5 hairline">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={s.holdSec ?? ''}
                          onChange={(e) => update(s.id, { holdSec: Number(e.target.value) })}
                          className="w-full bg-transparent text-sm text-mist-100 tnum outline-none"
                        />
                        <span className="text-[0.65rem] text-mist-700">s</span>
                      </label>
                    ) : (
                      <label className="flex min-w-[5rem] flex-1 items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1.5 hairline">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={s.reps ?? ''}
                          onChange={(e) => update(s.id, { reps: Number(e.target.value) })}
                          className="w-full bg-transparent text-sm text-mist-100 tnum outline-none"
                        />
                        <span className="text-[0.65rem] text-mist-700">reps</span>
                      </label>
                    )}
                    <label className="flex w-[5.5rem] items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1.5 hairline">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.loadKg ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          update(s.id, { loadKg: e.target.value === '' ? undefined : Number(e.target.value) })
                        }
                        className="w-full bg-transparent text-sm text-mist-100 tnum outline-none placeholder:text-mist-700"
                      />
                      <span className="text-[0.65rem] text-mist-700">kg</span>
                    </label>
                    <label className="flex w-[5rem] items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1.5 hairline">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.restSec ?? ''}
                        placeholder="repos"
                        onChange={(e) =>
                          update(s.id, { restSec: e.target.value === '' ? undefined : Number(e.target.value) })
                        }
                        className="w-full bg-transparent text-sm text-mist-100 tnum outline-none placeholder:text-mist-700"
                      />
                      <span className="text-[0.65rem] text-mist-700">s</span>
                    </label>
                    <label className="flex w-[4.5rem] items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1.5 hairline">
                      <input
                        type="text"
                        value={s.tempo ?? ''}
                        placeholder="tempo"
                        onChange={(e) => update(s.id, { tempo: e.target.value })}
                        className="w-full bg-transparent text-sm text-mist-100 outline-none placeholder:text-mist-700"
                      />
                    </label>
                    <button
                      onClick={() => update(s.id, { failure: !s.failure })}
                      className={`rounded-lg px-2 py-1.5 text-[0.68rem] transition ${
                        s.failure
                          ? 'bg-[#ff8f451f] text-[#ff8f45] shadow-[inset_0_0_0_1px_#ff8f4533]'
                          : 'bg-white/5 text-mist-700 hairline'
                      }`}
                      title="Série menée à l’échec"
                    >
                      échec
                    </button>
                    {ex && (s.reps ?? 0) > 0 && (
                      <span className="text-[0.62rem] text-mist-700 tnum">
                        {Math.round(set1RM(ex, s, data.bodyWeightKg))} kg
                      </span>
                    )}
                    <IconButton
                      label="Retirer la série"
                      className="h-8 w-8"
                      onClick={() => removeSet(s.id)}
                    >
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5">
                        <path d="M5 10h10" stroke="currentColor" strokeWidth="1.8" />
                      </svg>
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <Sheet open={picker} onClose={() => setPicker(false)} title="Bibliothèque d’exercices">
        <ExercisePicker
          onPick={(id) => {
            addSet(id)
            setPicker(false)
          }}
        />
      </Sheet>
    </Card>
  )
}

export function ExercisePicker({ onPick }: { onPick: (id: string) => void }) {
  const data = useSoma()
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const list = data.exercises.filter(
      (e) => !e.archived && e.name.toLowerCase().includes(q.toLowerCase()),
    )
    const map = new Map<string, ExerciseDef[]>()
    for (const e of list) {
      const g = map.get(e.group) ?? []
      g.push(e)
      map.set(e.group, g)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.exercises, q])

  return (
    <div className="space-y-3 pb-2">
      <TextInput
        placeholder="Chercher un exercice…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      {groups.map(([group, list]) => (
        <div key={group}>
          <div className="mb-1.5 text-[0.68rem] tracking-wider text-mist-500 uppercase">{group}</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {list.map((e) => (
              <button
                key={e.id}
                onClick={() => onPick(e.id)}
                className="rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm text-mist-100 hairline active:scale-[0.98]"
              >
                {e.name}
                {e.equipment && (
                  <span className="block text-[0.65rem] text-mist-700">{e.equipment}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!groups.length && <p className="py-6 text-center text-xs text-mist-700">Aucun résultat.</p>}
    </div>
  )
}

/* ── Course ──────────────────────────────────────────────────────────── */

function RunEditor({ w, patch }: { w: Workout; patch: (p: Partial<Workout>) => void }) {
  const run: RunDetail = w.run ?? { runType: 'footing' }
  const setRun = (p: Partial<RunDetail>) => patch({ run: { ...run, ...p } })
  const km = (run.distanceM ?? 0) / 1000
  const sec = run.durationSec ?? w.durationMin * 60
  const pace = km > 0.05 ? sec / km : 0

  const intervals = run.intervals ?? []
  const addInterval = () =>
    setRun({
      intervals: [
        ...intervals,
        { id: uid('int'), repetitions: 8, distanceM: 400, durationSec: 80, recoverySec: 60 },
      ],
    })
  const updateInterval = (id: string, p: Partial<IntervalEntry>) =>
    setRun({ intervals: intervals.map((i) => (i.id === id ? { ...i, ...p } : i)) })

  return (
    <Card title="Course à pied">
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select
            value={run.runType}
            onChange={(v) => setRun({ runType: v as RunType })}
            options={RUN_TYPES.map((t) => ({ value: t, label: RUN_TYPE_LABEL[t] }))}
          />
        </Field>
        <Field label="Distance">
          <Stepper
            value={km}
            onChange={(v) => setRun({ distanceM: Math.round(v * 1000) })}
            step={0.1}
            min={0}
            max={300}
            precision={2}
            suffix="km"
          />
        </Field>
        <Field label="Durée">
          <Stepper
            value={Math.round(sec / 60)}
            onChange={(v) => {
              setRun({ durationSec: v * 60 })
              patch({ durationMin: v })
            }}
            step={1}
            min={1}
            max={600}
            suffix="min"
          />
        </Field>
        <Field label="Allure calculée">
          <div className="rounded-xl bg-ink-900/70 px-3.5 py-2.5 text-sm text-accent tnum hairline">
            {pace > 0 ? fmtPace(pace) : '—'}
          </div>
        </Field>
        <Field label="FC moyenne" optional>
          <Stepper
            value={run.avgHr ?? 150}
            onChange={(v) => setRun({ avgHr: v })}
            min={60}
            max={230}
            suffix="bpm"
          />
        </Field>
        <Field label="FC max" optional>
          <Stepper
            value={run.maxHr ?? 175}
            onChange={(v) => setRun({ maxHr: v })}
            min={60}
            max={240}
            suffix="bpm"
          />
        </Field>
        <Field label="Dénivelé +" optional>
          <Stepper
            value={run.elevationGainM ?? 0}
            onChange={(v) => setRun({ elevationGainM: v })}
            step={10}
            min={0}
            max={6000}
            suffix="m"
          />
        </Field>
        <Field label="Dénivelé −" optional>
          <Stepper
            value={run.elevationLossM ?? 0}
            onChange={(v) => setRun({ elevationLossM: v })}
            step={10}
            min={0}
            max={6000}
            suffix="m"
          />
        </Field>
        <Field label="Chaussures" optional>
          <TextInput
            value={run.shoes ?? ''}
            onChange={(e) => setRun({ shoes: e.target.value })}
            placeholder="Route, trail…"
          />
        </Field>
        <Field label="Météo" optional>
          <TextInput
            value={run.weather ?? ''}
            onChange={(e) => setRun({ weather: e.target.value })}
            placeholder="12 °C, vent"
          />
        </Field>
      </div>

      {(run.runType === 'fractionne' || run.runType === 'cotes' || intervals.length > 0) && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[0.68rem] tracking-wider text-mist-500 uppercase">
              Fractionné
            </span>
            <Button className="px-2.5 py-1.5 text-[0.7rem]" onClick={addInterval}>
              + Bloc
            </Button>
          </div>
          <div className="space-y-1.5">
            {intervals.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white/4 p-2 hairline">
                {(
                  [
                    ['repetitions', '×', 1, 60],
                    ['distanceM', 'm', 0, 20000],
                    ['durationSec', 's', 0, 3600],
                    ['recoverySec', 's récup', 0, 1800],
                  ] as const
                ).map(([key, suffix, min, max]) => (
                  <label
                    key={key}
                    className="flex min-w-[5rem] flex-1 items-center gap-1 rounded-lg bg-ink-900/70 px-2 py-1.5 hairline"
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      value={(i[key] as number | undefined) ?? ''}
                      min={min}
                      max={max}
                      onChange={(e) => updateInterval(i.id, { [key]: Number(e.target.value) })}
                      className="w-full bg-transparent text-sm text-mist-100 tnum outline-none"
                    />
                    <span className="text-[0.62rem] whitespace-nowrap text-mist-700">{suffix}</span>
                  </label>
                ))}
                <IconButton
                  label="Retirer"
                  className="h-8 w-8"
                  onClick={() => setRun({ intervals: intervals.filter((x) => x.id !== i.id) })}
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5">
                    <path d="M5 10h10" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/* ── Cardio ──────────────────────────────────────────────────────────── */

function CardioEditor({ w, patch }: { w: Workout; patch: (p: Partial<Workout>) => void }) {
  const cardio: CardioDetail = w.cardio ?? { modality: 'velo' }
  const setCardio = (p: Partial<CardioDetail>) => patch({ cardio: { ...cardio, ...p } })
  return (
    <Card title="Cardio libre">
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="Modalité">
          <Select
            value={cardio.modality}
            onChange={(v) => setCardio({ modality: v })}
            options={CARDIO_MODALITIES.map((m) => ({ value: m.id, label: m.label }))}
          />
        </Field>
        <Field label="Distance" optional>
          <Stepper
            value={(cardio.distanceM ?? 0) / 1000}
            onChange={(v) => setCardio({ distanceM: Math.round(v * 1000) })}
            step={0.5}
            min={0}
            max={500}
            precision={2}
            suffix="km"
          />
        </Field>
        <Field label="Intensité" optional>
          <Stepper
            value={cardio.intensity ?? 5}
            onChange={(v) => setCardio({ intensity: v })}
            min={1}
            max={10}
            suffix="/10"
          />
        </Field>
        <Field label="FC moyenne" optional>
          <Stepper
            value={cardio.avgHr ?? 130}
            onChange={(v) => setCardio({ avgHr: v })}
            min={60}
            max={230}
            suffix="bpm"
          />
        </Field>
      </div>
    </Card>
  )
}

