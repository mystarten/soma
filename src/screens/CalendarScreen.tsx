import { useMemo, useState } from 'react'
import { format, isSameMonth } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import type { DayKey, WorkoutKind } from '../types'
import {
  Badge,
  Button,
  Card,
  Dot,
  IconButton,
  Segmented,
  Sheet,
  Stat,
  useToast,
} from '../components/ui/primitives'
import {
  addDayKey,
  dayKey,
  dayRange,
  monthBounds,
  parseDay,
  todayKey,
  weekBounds,
} from '../engine/time'
import { dayLoad } from '../engine/load'
import { computeSleepScore } from '../engine/sleep'
import { WORKOUT_KIND_LABEL } from '../engine/muscleMap'
import { plannedConflict } from '../engine/suggest'
import { navigate } from '../lib/router'
import { exportBackup, checkinsToCsv, workoutsToCsv, importBackup } from '../db/repo'

const KIND_COLOR: Record<WorkoutKind, string> = {
  street: '#35e3ff',
  muscu: '#9b7bff',
  course: '#41e08a',
  cardio: '#27e0c0',
  abdos: '#ffc24b',
  mobilite: '#8fb4ff',
  custom: '#c8ef5a',
}

const recoveryTint = (v: number | undefined) => {
  if (v === undefined) return '#ffffff08'
  if (v >= 67) return `rgba(65,224,138,${0.14 + (v / 100) * 0.3})`
  if (v >= 34) return `rgba(255,194,75,${0.14 + (v / 100) * 0.3})`
  return `rgba(255,90,90,${0.16 + (v / 100) * 0.3})`
}

function download(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function CalendarScreen({ day: dayParam }: { day?: string }) {
  const data = useSoma()
  const [view, setView] = useState<'mois' | 'semaine'>('mois')
  const [anchor, setAnchor] = useState<DayKey>(dayParam ?? todayKey())
  const [selected, setSelected] = useState<DayKey | null>(dayParam ?? null)
  const [quick, setQuick] = useState(false)
  const toast = useToast()

  const plan = data.goals.find((g) => g.kind === 'weekly_plan' && g.active)?.plan

  const bounds = useMemo(
    () => (view === 'mois' ? monthBounds(anchor) : weekBounds(anchor, data.settings.weekStartsOn)),
    [view, anchor, data.settings.weekStartsOn],
  )

  const gridDays = useMemo(() => {
    if (view === 'semaine') return dayRange(bounds.start, bounds.end)
    const first = parseDay(bounds.start)
    const offset = (first.getDay() - data.settings.weekStartsOn + 7) % 7
    const start = addDayKey(bounds.start, -offset)
    const last = parseDay(bounds.end)
    const tail = (6 - ((last.getDay() - data.settings.weekStartsOn + 7) % 7) + 7) % 7
    return dayRange(start, addDayKey(bounds.end, tail))
  }, [view, bounds, data.settings.weekStartsOn])

  const info = useMemo(() => {
    const map = new Map<
      DayKey,
      {
        recovery?: number
        kinds: { kind: WorkoutKind; planned: boolean; title: string }[]
        load: number
        missed: boolean
        unplanned: boolean
        conflict: string | null
      }
    >()
    for (const d of gridDays) {
      const checkin = data.checkinByDay.get(d)
      const workouts = data.workouts.filter((w) => w.day === d)
      const planForDay = plan?.find((p) => p.weekday === parseDay(d).getDay() && p.kind !== 'repos')
      const done = workouts.filter((w) => !w.planned)
      const missed =
        !!planForDay &&
        d < todayKey() &&
        !done.some((w) => w.kind === (planForDay.kind as WorkoutKind))
      const unplanned = !planForDay && done.length > 0
      const plannedWorkout = workouts.find((w) => w.planned)
      map.set(d, {
        recovery: checkin?.recovery,
        kinds: workouts.map((w) => ({
          kind: w.kind,
          planned: !!w.planned,
          title: w.title || WORKOUT_KIND_LABEL[w.kind],
        })),
        load: dayLoad(d, data.workouts, data.checkinByDay, data.loadCtx).load,
        missed,
        unplanned,
        conflict: plannedWorkout
          ? plannedConflict(plannedWorkout, data.body, data.exercises)
          : null,
      })
    }
    return map
  }, [gridDays, data.checkinByDay, data.workouts, data.loadCtx, data.body, data.exercises, plan])

  const weekdayLabels = useMemo(() => {
    /* 2025-06-01 est un dimanche, 2025-06-02 un lundi. */
    const first = data.settings.weekStartsOn === 1 ? '2025-06-02' : '2025-06-01'
    return Array.from({ length: 7 }, (_, i) =>
      format(parseDay(addDayKey(first, i)), 'EEEEE', { locale: fr }),
    )
  }, [data.settings.weekStartsOn])

  const shift = (n: number) => {
    const d = parseDay(anchor)
    if (view === 'mois') setAnchor(dayKey(new Date(d.getFullYear(), d.getMonth() + n, 1)))
    else setAnchor(addDayKey(anchor, n * 7))
  }

  const conflicts = gridDays.filter((d) => info.get(d)?.conflict)

  return (
    <div className="mx-auto w-full max-w-4xl">
      {toast.node}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'mois', label: 'Mois' },
            { value: 'semaine', label: 'Semaine' },
          ]}
        />
        <div className="flex items-center gap-1.5">
          <IconButton label="Précédent" onClick={() => shift(-1)}>
            <svg viewBox="0 0 20 20" className="h-4 w-4">
              <path d="M12 4l-5 6 5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </IconButton>
          <span className="min-w-[8.5rem] text-center text-sm text-mist-100 capitalize">
            {view === 'mois'
              ? format(parseDay(anchor), 'MMMM yyyy', { locale: fr })
              : `${format(parseDay(bounds.start), 'd MMM', { locale: fr })} – ${format(
                  parseDay(bounds.end),
                  'd MMM',
                  { locale: fr },
                )}`}
          </span>
          <IconButton label="Suivant" onClick={() => shift(1)}>
            <svg viewBox="0 0 20 20" className="h-4 w-4">
              <path d="M8 4l5 6-5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </IconButton>
        </div>
      </div>

      <Card padded={false}>
        <div className="grid grid-cols-7 gap-px px-2 pt-3 pb-1 text-center text-[0.62rem] tracking-wider text-mist-700 uppercase">
          {weekdayLabels.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 p-2">
          {gridDays.map((d) => {
            const i = info.get(d)!
            const inMonth = view === 'semaine' || isSameMonth(parseDay(d), parseDay(anchor))
            const isToday = d === todayKey()
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={`relative flex flex-col items-center gap-1 rounded-xl py-2 transition active:scale-95 ${
                  inMonth ? '' : 'opacity-35'
                } ${view === 'semaine' ? 'min-h-[6.5rem]' : 'min-h-[3.4rem] sm:min-h-[5.6rem]'}`}
                style={{
                  background: recoveryTint(i.recovery),
                  boxShadow: isToday
                    ? 'inset 0 0 0 1px var(--accent)'
                    : 'inset 0 0 0 1px #ffffff0d',
                }}
              >
                <span className="text-[0.72rem] text-mist-100 tnum">{parseDay(d).getDate()}</span>
                <span className="flex min-h-[0.5rem] flex-wrap justify-center gap-0.5 sm:hidden">
                  {i.kinds.slice(0, 4).map((k, n) => (
                    <Dot
                      key={n}
                      color={k.planned ? '#4f5f7a' : KIND_COLOR[k.kind]}
                      size={view === 'semaine' ? 7 : 5}
                    />
                  ))}
                </span>
                <span className="hidden w-full flex-col gap-0.5 px-1 sm:flex">
                  {i.kinds.slice(0, 3).map((k, n) => (
                    <span
                      key={n}
                      className="truncate rounded px-1 py-px text-left text-[0.62rem] leading-tight"
                      style={{
                        background: `${k.planned ? '#4f5f7a' : KIND_COLOR[k.kind]}26`,
                        color: k.planned ? '#9aa9c2' : KIND_COLOR[k.kind],
                      }}
                    >
                      {k.title}
                    </span>
                  ))}
                  {i.kinds.length > 3 && (
                    <span className="text-[0.58rem] text-mist-700">+{i.kinds.length - 3}</span>
                  )}
                </span>
                {i.missed && (
                  <span
                    className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[#ffc24b66]"
                    title="Séance prévue non faite"
                  />
                )}
                {i.unplanned && (
                  <span
                    className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-[#35e3ff55]"
                    title="Séance non prévue"
                  />
                )}
                {view === 'semaine' && i.load > 0.2 && (
                  <span className="text-[0.6rem] text-mist-700 tnum">{i.load.toFixed(1)}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-white/8 px-3 py-2 text-[0.62rem] text-mist-700">
          <span>Fond = récupération</span>
          <span className="flex items-center gap-1">
            <Dot color="#35e3ff" size={5} /> séance
          </span>
          <span className="flex items-center gap-1">
            <Dot color="#4f5f7a" size={5} /> prévue
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ffc24b66]" /> prévue non faite
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#35e3ff55]" /> non prévue
          </span>
        </div>
      </Card>

      <PeriodList from={bounds.start} to={bounds.end} view={view} />

      {conflicts.length > 0 && (
        <Card className="mt-3">
          <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">
            À garder en tête
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-mist-300">
            {conflicts.slice(0, 3).map((d) => (
              <li key={d}>
                {format(parseDay(d), 'EEEE d MMM', { locale: fr })} — {info.get(d)!.conflict}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setQuick(true)}>Saisie rapide historique</Button>
        <Button
          onClick={async () => {
            const b = await exportBackup()
            download(`soma-sauvegarde-${todayKey()}.json`, JSON.stringify(b, null, 2))
            toast.show('Export JSON téléchargé')
          }}
        >
          Export JSON
        </Button>
        <Button
          onClick={async () => {
            const b = await exportBackup()
            download(`soma-jours-${todayKey()}.csv`, checkinsToCsv(b.checkins, b.metrics), 'text/csv')
            download(
              `soma-seances-${todayKey()}.csv`,
              workoutsToCsv(b.workouts, b.exercises),
              'text/csv',
            )
            toast.show('Export CSV téléchargé')
          }}
        >
          Export CSV
        </Button>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/6 px-4 py-2.5 text-sm font-medium text-mist-100 hairline">
          Importer JSON
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                const res = await importBackup(JSON.parse(await f.text()))
                toast.show(`${res.checkins} jours et ${res.workouts} séances importés`)
              } catch (err) {
                toast.show(err instanceof Error ? err.message : 'Import impossible')
              }
            }}
          />
        </label>
      </div>

      <DaySheet day={selected} onClose={() => setSelected(null)} />

      <Sheet open={quick} onClose={() => setQuick(false)} title="Saisie rapide historique" wide>
        <QuickHistory onDone={() => setQuick(false)} />
      </Sheet>
    </div>
  )
}

/* ── Liste des séances faites sur la période ─────────────────────────── */

function PeriodList({ from, to, view }: { from: DayKey; to: DayKey; view: 'mois' | 'semaine' }) {
  const data = useSoma()
  const list = useMemo(
    () =>
      data.workouts
        .filter((w) => !w.planned && w.day >= from && w.day <= to)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [data.workouts, from, to],
  )
  const minutes = list.reduce((s, w) => s + w.durationMin, 0)
  const km = list.reduce((s, w) => s + (w.run?.distanceM ?? w.cardio?.distanceM ?? 0) / 1000, 0)
  return (
    <Card
      className="mt-3"
      title={view === 'mois' ? 'Séances du mois' : 'Séances de la semaine'}
      subtitle={`${list.length} séance${list.length > 1 ? 's' : ''} · ${Math.round(minutes)} min${
        km > 0.5 ? ` · ${km.toFixed(1)} km` : ''
      }`}
    >
      <div className="mt-3 space-y-1.5">
        {list.map((w) => (
          <button
            key={w.id}
            onClick={() => navigate('seances', w.id)}
            className="flex w-full items-center gap-3 rounded-xl bg-white/4 px-3 py-2 text-left hairline"
          >
            <Dot color={KIND_COLOR[w.kind]} size={8} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-mist-100">
                {w.title || WORKOUT_KIND_LABEL[w.kind]}
              </span>
              <span className="text-[0.68rem] text-mist-700">
                {format(parseDay(w.day), 'EEE d MMM', { locale: fr })} ·{' '}
                {format(new Date(w.startedAt), 'HH:mm')} · {w.durationMin} min
                {w.rpe ? ` · RPE ${w.rpe}` : ''}
              </span>
            </span>
          </button>
        ))}
        {!list.length && (
          <p className="py-3 text-center text-xs text-mist-700">Aucune séance sur cette période.</p>
        )}
      </div>
    </Card>
  )
}

/* ── Détail d'un jour ────────────────────────────────────────────────── */

function DaySheet({ day, onClose }: { day: DayKey | null; onClose: () => void }) {
  const data = useSoma()
  if (!day) return null
  const checkin = data.checkinByDay.get(day)
  const workouts = data.workouts.filter((w) => w.day === day)
  const sleep = computeSleepScore(data.checkinByDay, day, data.settings.sleepGoalHours)
  const load = dayLoad(day, data.workouts, data.checkinByDay, data.loadCtx).load

  return (
    <Sheet
      open
      onClose={onClose}
      title={format(parseDay(day), 'EEEE d MMMM yyyy', { locale: fr })}
      footer={
        <div className="flex gap-2">
          <Button variant="primary" full onClick={() => navigate('checkin', day)}>
            {checkin ? 'Modifier le check-in' : 'Ajouter un check-in'}
          </Button>
          <Button onClick={() => navigate('seances', `new:${day}`)}>+ Séance</Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="Récupération" value={checkin?.recovery ?? '—'} unit="%" />
          </div>
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat
              label="Sommeil"
              value={sleep.hours !== null ? sleep.hours.toFixed(1) : '—'}
              unit="h"
              hint={sleep.score ? `score ${Math.round(sleep.score)}` : undefined}
            />
          </div>
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="Charge" value={load.toFixed(1)} unit="/ 21" />
          </div>
        </div>

        {workouts.length ? (
          <div className="space-y-1.5">
            {workouts.map((w) => (
              <button
                key={w.id}
                onClick={() => navigate('seances', w.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2.5 text-left hairline"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-mist-100">
                    {w.title || WORKOUT_KIND_LABEL[w.kind]}
                  </span>
                  <span className="text-[0.68rem] text-mist-700">
                    {format(new Date(w.startedAt), 'HH:mm')} · {w.durationMin} min
                    {w.rpe ? ` · RPE ${w.rpe}` : ''}
                  </span>
                </span>
                {w.planned && <Badge color="#9b7bff">prévue</Badge>}
              </button>
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-xs text-mist-700">Aucune séance ce jour-là.</p>
        )}

        {checkin?.notes && (
          <p className="rounded-xl bg-white/4 p-3 text-xs text-mist-300 hairline">{checkin.notes}</p>
        )}
      </div>
    </Sheet>
  )
}

/* ── Saisie rapide de plusieurs jours passés ─────────────────────────── */

function QuickHistory({ onDone }: { onDone: () => void }) {
  const data = useSoma()
  const [cursor, setCursor] = useState<DayKey>(addDayKey(todayKey(), -1))
  const toast = useToast()
  const existing = data.checkinByDay.get(cursor)
  const [recovery, setRecovery] = useState(existing?.recovery ?? 65)
  const [hours, setHours] = useState(existing?.sleep?.hours ?? 7.5)

  const goto = (d: DayKey) => {
    const c = data.checkinByDay.get(d)
    setCursor(d)
    setRecovery(c?.recovery ?? 65)
    setHours(c?.sleep?.hours ?? 7.5)
  }

  const save = async (then: 'prev' | 'done') => {
    const { saveCheckIn } = await import('../db/repo')
    await saveCheckIn({
      id: cursor,
      day: cursor,
      recovery,
      sleep: { ...data.checkinByDay.get(cursor)?.sleep, hours, quality: existing?.sleep?.quality },
      source: 'manual',
      updatedAt: new Date().toISOString(),
    })
    if (then === 'prev') {
      goto(addDayKey(cursor, -1))
      toast.show('Enregistré, jour précédent')
    } else {
      toast.show('Enregistré')
      onDone()
    }
  }

  return (
    <div className="space-y-4 pb-2">
      {toast.node}
      <p className="text-xs text-mist-500">
        Enchaîne les jours passés : récupération et sommeil, puis « Jour précédent ». Le reste se
        complète plus tard si tu veux.
      </p>
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Jour suivant" onClick={() => goto(addDayKey(cursor, 1))}>
          <svg viewBox="0 0 20 20" className="h-4 w-4">
            <path d="M12 4l-5 6 5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </IconButton>
        <span className="text-sm text-mist-100 capitalize">
          {format(parseDay(cursor), 'EEEE d MMMM', { locale: fr })}
        </span>
        <IconButton label="Jour précédent" onClick={() => goto(addDayKey(cursor, -1))}>
          <svg viewBox="0 0 20 20" className="h-4 w-4">
            <path d="M8 4l5 6-5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </IconButton>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-mist-300">Récupération</span>
          <span className="text-mist-100 tnum">{recovery} %</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={recovery}
          onChange={(e) => setRecovery(Number(e.target.value))}
        />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-mist-300">Sommeil</span>
          <span className="text-mist-100 tnum">{hours.toFixed(2)} h</span>
        </div>
        <input
          type="range"
          min={0}
          max={12}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="primary" full onClick={() => save('prev')}>
          Enregistrer & jour précédent
        </Button>
        <Button onClick={() => save('done')}>Terminer</Button>
      </div>
    </div>
  )
}
