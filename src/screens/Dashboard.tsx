import { useMemo } from 'react'
import { useSoma } from '../hooks/useSoma'
import { Ring } from '../components/ui/Ring'
import { Button, Card, ProgressBar } from '../components/ui/primitives'
import { Spark } from '../components/charts/charts'
import { navigate } from '../lib/router'
import { addDayKey, lastDays, weekBounds } from '../engine/time'
import { dayLoadSeries } from '../engine/load'
import { programStats } from '../engine/program'
import { reviewDone, reviewWeekFor, weekStats } from '../engine/review'
import { countdownLabel, taskLoad, upcomingDeadlines } from '../engine/tasks'
import { fatigueColor } from '../engine/fatigueConfig'

/* ──────────────────────────────────────────────────────────────────────────
   Tableau de bord : l'essentiel de la semaine sur un écran.
   Programme, récupération, tendances, tâches, objectifs, revue.
   ────────────────────────────────────────────────────────────────────────── */

const recoveryColor = (v: number) => (v >= 67 ? '#41e08a' : v >= 34 ? '#ffc24b' : '#ff5a5a')

export default function Dashboard() {
  const data = useSoma()
  const { today } = data
  const week = weekBounds(today, data.settings.weekStartsOn)
  const checkin = data.checkinByDay.get(today)
  const recovery = checkin?.recovery ?? null
  const sleep = data.sleepScore.score

  const days = useMemo(() => lastDays(today, 14), [today])
  const loads = useMemo(
    () => dayLoadSeries(days[0], today, data.workouts, data.checkins, data.loadCtx),
    [days, today, data.workouts, data.checkins, data.loadCtx],
  )
  const recSeries = days.flatMap((d) => {
    const v = data.checkinByDay.get(d)?.recovery
    return typeof v === 'number' ? [{ day: d, value: v }] : []
  })
  const sleepSeries = days.flatMap((d) => {
    const v = data.checkinByDay.get(d)?.sleep?.hours
    return typeof v === 'number' ? [{ day: d, value: v }] : []
  })
  const loadSeries = loads.map((l) => ({ day: l.day, value: l.load }))

  const stats = useMemo(
    () => weekStats(week.start, { workouts: data.workouts, checkins: data.checkins, tasks: data.tasks }),
    [week.start, data.workouts, data.checkins, data.tasks],
  )
  const prog = data.program ? programStats(data.program, data.workouts, today) : null
  const load = taskLoad(data.tasks, today, data.settings.weekStartsOn)
  const deadlines = upcomingDeadlines(data.deadlines, today, 4)
  const toReview = reviewWeekFor(today, data.settings.weekStartsOn)
  const reviewed = reviewDone(data.reviews.find((r) => r.id === toReview.start))
  const goals = [...data.goalProgress].sort((a, b) => a.ratio - b.ratio).slice(0, 4)

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Aujourd’hui" className="md:col-span-2 xl:col-span-1">
        <div className="flex justify-around">
          <Ring
            value={recovery ?? 0}
            display={recovery === null ? '—' : String(Math.round(recovery))}
            unit="%"
            color={recovery === null ? '#5a6c86' : recoveryColor(recovery)}
            label="Récup."
            size={84}
            thickness={8}
          />
          <Ring value={loads[loads.length - 1]?.load ?? 0} max={21} display={(loads[loads.length - 1]?.load ?? 0).toFixed(1)} unit="/21" label="Charge" size={84} thickness={8} />
          <Ring
            value={sleep}
            display={sleep > 0 ? String(Math.round(sleep)) : '—'}
            unit="%"
            color={sleep > 0 ? fatigueColor(100 - sleep) : '#5a6c86'}
            label="Sommeil"
            size={84}
            thickness={8}
          />
        </div>
        {recovery === null && (
          <Button variant="primary" full className="mt-3" onClick={() => navigate('checkin')}>
            Faire mon check-in
          </Button>
        )}
        <p className="mt-3 text-center text-xs text-mist-500">
          Alignement des objectifs : <span className="text-mist-100 tnum">{Math.round(data.alignment)} %</span>
        </p>
      </Card>

      <Card title="Programme" action={<LinkBtn to="seances" label="Ouvrir" />}>
        {prog ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-mist-100">
                {prog.done} / {prog.total} séances
              </span>
              <span className="text-xs text-mist-500">cette semaine {prog.thisWeekDone} / {prog.thisWeekTotal}</span>
            </div>
            <div className="mt-2">
              <ProgressBar ratio={prog.total ? prog.done / prog.total : 0} />
            </div>
            <p className="mt-3 text-xs text-mist-500">
              Chaque séance et chaque semaine sont indépendantes : choisis ce que tu fais, dans l’ordre que tu veux.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-mist-300">Importe ton programme pour choisir séance et semaine en deux touches.</p>
            <Button variant="primary" full className="mt-3" onClick={() => navigate('seances')}>
              Importer mon programme
            </Button>
          </>
        )}
      </Card>

      <Card title="Cette semaine" subtitle={`${stats.sessions} séance${stats.sessions > 1 ? 's' : ''} · ${Math.round(stats.minutes)} min`}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Cell value={stats.tasksDone} unit="tâches faites" />
          <Cell value={load.week} unit="à venir" />
          <Cell value={load.overdue} unit="en retard" warn={load.overdue > 0} />
        </div>
        <div className="mt-3 text-xs text-mist-500">
          {data.workouts.some((w) => w.day >= week.start && w.day <= addDayKey(week.start, 6) && w.planned)
            ? 'Des séances prévues t’attendent.'
            : 'Rien de prévu : tu décides.'}
        </div>
      </Card>

      <Card title="Tendances · 14 jours" className="md:col-span-2 xl:col-span-1">
        <Trend label="Récupération" suffix=" %" series={recSeries} color="#41e08a" />
        <Trend label="Sommeil" suffix=" h" series={sleepSeries} color="#9b7bff" digits={1} />
        <Trend label="Charge" suffix=" /21" series={loadSeries} color="var(--accent)" digits={1} />
      </Card>

      <Card title="Échéances" action={<LinkBtn to="taches" label="Tout voir" />}>
        {deadlines.length ? (
          <ul className="flex flex-col gap-1.5">
            {deadlines.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-mist-100">{d.title}</span>
                <span className="shrink-0 text-xs text-[#ffc24b] tnum">{countdownLabel(d, today)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mist-500">Aucune échéance à venir.</p>
        )}
      </Card>

      <Card title="Objectifs" action={<LinkBtn to="objectifs" label="Détails" />}>
        {goals.length ? (
          <ul className="flex flex-col gap-2.5">
            {goals.map((g) => (
              <li key={g.goal.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-mist-100">{g.goal.name}</span>
                  <span className="shrink-0 text-mist-500 tnum">{g.label}</span>
                </div>
                <ProgressBar ratio={g.ratio} height={6} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mist-500">Aucun objectif actif.</p>
        )}
      </Card>

      <Card title="Revue de la semaine" className="md:col-span-2 xl:col-span-1">
        {reviewed ? (
          <p className="text-sm text-mist-300">Revue faite pour cette semaine ✓ Tu peux la relire ou la compléter.</p>
        ) : (
          <p className="text-sm text-mist-300">
            {toReview.current ? 'La semaine se termine' : 'La semaine dernière est à revoir'} : deux minutes pour garder ce
            qui marche et lâcher le reste.
          </p>
        )}
        <Button variant={reviewed ? 'soft' : 'primary'} full className="mt-3" onClick={() => navigate('revue')}>
          {reviewed ? 'Relire ma revue' : 'Faire ma revue'}
        </Button>
      </Card>
    </div>
  )
}

function LinkBtn({ to, label }: { to: Parameters<typeof navigate>[0]; label: string }) {
  return (
    <button onClick={() => navigate(to)} className="text-xs text-accent">
      {label} →
    </button>
  )
}

function Cell({ value, unit, warn }: { value: number; unit: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-white/5 py-2 hairline">
      <div className="text-lg font-semibold tnum" style={{ color: warn ? '#ffb02e' : 'var(--color-mist-100)' }}>
        {value}
      </div>
      <div className="text-[0.65rem] text-mist-500">{unit}</div>
    </div>
  )
}

function Trend({
  label,
  series,
  suffix,
  color,
  digits = 0,
}: {
  label: string
  series: { day: string; value: number }[]
  suffix: string
  color: string
  digits?: number
}) {
  const last = series[series.length - 1]
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-mist-300">{label}</span>
        <span className="text-mist-100 tnum">{last ? `${last.value.toFixed(digits)}${suffix}` : '—'}</span>
      </div>
      {series.length > 1 ? <Spark data={series} color={color} height={38} /> : <div className="h-[38px] text-[0.65rem] text-mist-700">Pas encore assez de jours.</div>}
    </div>
  )
}
