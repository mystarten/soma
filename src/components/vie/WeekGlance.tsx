import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { ProgressBar } from '../ui/primitives'
import { navigate } from '../../lib/router'
import { STATUS_COLOR } from '../../engine/goals'
import { addDayKey } from '../../engine/time'
import { recoveryProfile, restAdvice, streetStreak, weeklyEffort } from '../../engine/performance'
import { workoutLoad } from '../../engine/load'

const ADV = { good: '#41e08a', watch: '#ffc24b', info: '#8fb4ff' } as const
const LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`)

/** Ma semaine en un coup d'œil : jours faits, volume, objectifs de la semaine. */
export default function WeekGlance() {
  const data = useSoma()
  const { today, settings } = data
  const rows = useMemo(() => weeklyEffort(data.workouts, today, 2, settings.weekStartsOn), [data.workouts, today, settings.weekStartsOn])
  const cur = rows[1]
  const prev = rows[0]
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDayKey(cur.start, i)), [cur.start])
  const doneDays = new Set(data.workouts.filter((w) => !w.planned && !w.backfill).map((w) => w.day))
  const minutes = cur.force + cur.course + cur.cardio + cur.autre
  const street = useMemo(() => streetStreak(data.workouts, today), [data.workouts, today])
  const advice = useMemo(() => {
    const last = [...data.workouts].filter((w) => !w.planned).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    const hrv = recoveryProfile(data.checkinByDay, today).find((p) => p.label === 'VFC')
    return restAdvice({
      streak: street.days,
      todayDone: street.todayDone,
      restEvery: settings.restEvery ?? 3,
      recovery: data.checkinByDay.get(today)?.recovery ?? null,
      lastLoad: last && (last.day === today || last.day === addDayKey(today, -1)) ? (last.whoopStrain ?? workoutLoad(last, data.loadCtx)) : 0,
      hrvDeltaPct: hrv?.deltaPct ?? null,
    })
  }, [data.workouts, data.checkinByDay, data.loadCtx, today, street, settings.restEvery])
  const goals = data.goalProgress.filter((p) => p.goal.active && p.goal.period === 'week').slice(0, 3)

  return (
    <section aria-label="Ma semaine" className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-medium text-mist-100">Ma semaine</h3>
        <button onClick={() => navigate('objectifs')} className="text-xs text-accent">Objectifs →</button>
      </div>
      <div className="mb-3 rounded-xl px-3 py-2" style={{ background: `${ADV[advice.tone]}1a`, borderLeft: `3px solid ${ADV[advice.tone]}` }}>
        <p className="text-sm font-medium text-mist-100">{advice.title}</p>
        <p className="text-xs text-mist-300">{advice.detail}</p>
      </div>
      <div className="flex justify-between">
        {days.map((d) => {
          const done = doneDays.has(d)
          const isToday = d === today
          return (
            <div key={d} className="flex flex-col items-center gap-1">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-medium ${done ? 'bg-accent text-ink-950' : 'bg-white/6 text-mist-500'} ${isToday ? 'ring-2 ring-accent/60' : ''}`}>
                {done ? '✓' : ''}
              </span>
              <span className={`text-[0.62rem] ${isToday ? 'text-accent' : 'text-mist-500'}`}>{LETTERS[new Date(`${d}T12:00:00`).getDay()]}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/4 py-2 hairline">
          <div className="text-lg font-semibold tnum text-mist-100">{cur.sessions}</div>
          <div className="text-[0.62rem] text-mist-500">séances{prev.sessions ? ` · ${prev.sessions} la sem. passée` : ''}</div>
        </div>
        <div className="rounded-xl bg-white/4 py-2 hairline">
          <div className="text-lg font-semibold tnum text-mist-100">{minutes ? fmtMin(minutes) : '—'}</div>
          <div className="text-[0.62rem] text-mist-500">d’entraînement</div>
        </div>
        <div className="rounded-xl bg-white/4 py-2 hairline">
          <div className="text-lg font-semibold tnum text-mist-100">{street.days}</div>
          <div className="text-[0.62rem] text-mist-500">jour{street.days > 1 ? 's' : ''} de street d’affilée</div>
        </div>
      </div>
      {goals.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {goals.map((p) => (
            <li key={p.goal.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-mist-300">{p.goal.name}</span>
                <span className="tnum text-mist-100">{Math.round(p.actual * 10) / 10} / {p.target} {p.label}</span>
              </div>
              <ProgressBar ratio={p.ratio} color={STATUS_COLOR[p.status]} />
            </li>
          ))}
        </ul>
      ) : (
        <button onClick={() => navigate('objectifs')} className="mt-3 w-full rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs text-mist-300">
          Ajoute tes objectifs de la semaine pour les suivre ici
        </button>
      )}
    </section>
  )
}
