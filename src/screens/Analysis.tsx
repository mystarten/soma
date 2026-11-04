import { useMemo, useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import { Card, Dot, Segmented, Select, Stat } from '../components/ui/primitives'
import { Bars, Correlation, GlowArea, SmoothLines } from '../components/charts/charts'
import { dayLoadSeries, exerciseRecords, exerciseVolume, loadBalance } from '../engine/load'
import { computeSleepScore, sleepDebtHours, sleepHours } from '../engine/sleep'
import { addDayKey, lastDays, weekBounds } from '../engine/time'
import { movingAverage, pearson } from '../engine/stats'
import { fatigueColor } from '../engine/fatigueConfig'

const RANGES = [
  { value: '7', label: '7 j' },
  { value: '30', label: '30 j' },
  { value: '90', label: '90 j' },
  { value: '365', label: '1 an' },
  { value: 'all', label: 'Tout' },
]

export default function Analysis() {
  const data = useSoma()
  const [range, setRange] = useState('30')
  const [exerciseId, setExerciseId] = useState<string>('')

  const days = useMemo(() => {
    if (range === 'all') {
      const first =
        [...data.checkins.map((c) => c.day), ...data.workouts.map((w) => w.day)].sort()[0] ??
        addDayKey(data.today, -30)
      return lastDays(data.today, Math.max(7, Math.min(1500, -(-1 * daysBetween(first, data.today)) + 1)))
    }
    return lastDays(data.today, Number(range))
  }, [range, data.checkins, data.workouts, data.today])

  const loads = useMemo(
    () => dayLoadSeries(days[0], days[days.length - 1], data.workouts, data.checkins, data.loadCtx),
    [days, data.workouts, data.checkins, data.loadCtx],
  )

  const balance = useMemo(
    () => loadBalance(data.today, data.workouts, data.checkins, data.loadCtx),
    [data.today, data.workouts, data.checkins, data.loadCtx],
  )

  const sleepSeries = useMemo(
    () =>
      days.map((day) => {
        const c = data.checkinByDay.get(day)
        return {
          day,
          heures: sleepHours(c),
          dette: sleepDebtHours(data.checkinByDay, day, data.settings.sleepGoalHours),
          score: c?.sleep
            ? computeSleepScore(data.checkinByDay, day, data.settings.sleepGoalHours).score
            : null,
        }
      }),
    [days, data.checkinByDay, data.settings.sleepGoalHours],
  )

  const healthSeries = useMemo(() => {
    const rhr = days.map((d) => data.checkinByDay.get(d)?.restingHr ?? null)
    const hrv = days.map((d) => data.checkinByDay.get(d)?.hrv ?? null)
    const weight = days.map((d) => data.checkinByDay.get(d)?.weightKg ?? null)
    const rhrAvg = movingAverage(rhr, 5)
    const hrvAvg = movingAverage(hrv, 5)
    return days.map((day, i) => ({
      day,
      fcRepos: rhrAvg[i],
      hrv: hrvAvg[i],
      poids: weight[i],
    }))
  }, [days, data.checkinByDay])

  /* ── Corrélations ── */
  const correlations = useMemo(() => {
    const sleepVsRecovery: { x: number; y: number }[] = []
    const loadVsRecovery: { x: number; y: number }[] = []
    const hrvVsRhr: { x: number; y: number }[] = []
    const loadByDay = new Map(loads.map((l) => [l.day, l.load]))
    for (const day of days) {
      const c = data.checkinByDay.get(day)
      const next = data.checkinByDay.get(addDayKey(day, 1))
      const h = sleepHours(c)
      if (h !== null && typeof next?.recovery === 'number')
        sleepVsRecovery.push({ x: Math.round(h * 10) / 10, y: next.recovery })
      const l = loadByDay.get(day)
      if (l !== undefined && l > 0 && typeof next?.recovery === 'number')
        loadVsRecovery.push({ x: Math.round(l * 10) / 10, y: next.recovery })
      if (c?.hrv && c?.restingHr) hrvVsRhr.push({ x: c.hrv, y: c.restingHr })
    }
    return {
      sleepVsRecovery,
      loadVsRecovery,
      hrvVsRhr,
      rSleep: pearson(sleepVsRecovery.map((p) => p.x), sleepVsRecovery.map((p) => p.y)),
      rLoad: pearson(loadVsRecovery.map((p) => p.x), loadVsRecovery.map((p) => p.y)),
      rHrv: pearson(hrvVsRhr.map((p) => p.x), hrvVsRhr.map((p) => p.y)),
    }
  }, [days, data.checkinByDay, loads])

  /* ── Volume par exercice ── */
  const practiced = useMemo(() => {
    const ids = new Set<string>()
    for (const w of data.workouts) for (const s of w.sets ?? []) ids.add(s.exerciseId)
    return data.exercises.filter((e) => ids.has(e.id))
  }, [data.workouts, data.exercises])

  const activeExercise = exerciseId || practiced[0]?.id || ''

  const exerciseSeries = useMemo(() => {
    if (!activeExercise) return []
    const weeks: { day: string; reps: number; tonnage: number; record: number }[] = []
    let cursor = days[0]
    while (cursor <= data.today) {
      const b = weekBounds(cursor, data.settings.weekStartsOn)
      const ws = data.workouts.filter((w) => w.day >= b.start && w.day <= b.end)
      const v = exerciseVolume(activeExercise, ws, data.loadCtx)
      const r = exerciseRecords(activeExercise, ws, data.loadCtx)
      weeks.push({
        day: b.start,
        reps: v.reps,
        tonnage: Math.round(v.tonnage),
        record: Math.round(r.best1RM),
      })
      cursor = addDayKey(b.end, 1)
    }
    return weeks
  }, [activeExercise, days, data.workouts, data.loadCtx, data.today, data.settings.weekStartsOn])

  const ratioColor =
    balance.ratio > 1.5 ? '#ff8f45' : balance.ratio > 1.3 ? '#ffc24b' : '#41e08a'

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-3">
        <Segmented value={range} onChange={setRange} options={RANGES} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Charge par jour" subtitle="0 → 21, durée × intensité + volume">
          <Bars
            data={loads.map((l) => ({ day: l.day, charge: Math.round(l.load * 10) / 10 }))}
            series={[{ key: 'charge', color: 'var(--accent)', name: 'Charge' }]}
            colorByValue={(v) => fatigueColor(Math.min(100, (v / 21) * 100))}
            height={170}
            unit="/ 21"
          />
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/4 p-3 hairline">
              <Stat label="Aiguë 7 j" value={balance.acute7.toFixed(1)} />
            </div>
            <div className="rounded-xl bg-white/4 p-3 hairline">
              <Stat label="Chronique 28 j" value={balance.chronic28.toFixed(1)} />
            </div>
            <div className="rounded-xl bg-white/4 p-3 hairline">
              <Stat
                label="Ratio"
                value={balance.ratio ? balance.ratio.toFixed(2) : '—'}
                color={ratioColor}
                hint={
                  balance.ratio > 1.5
                    ? 'montée rapide'
                    : balance.ratio < 0.8
                      ? 'phase calme'
                      : 'zone confortable'
                }
              />
            </div>
          </div>
        </Card>

        <Card title="Sommeil" subtitle="Heures et dette cumulée sur 7 jours">
          <SmoothLines
            data={sleepSeries}
            series={[
              { key: 'heures', color: '#9b7bff', name: 'heures' },
              { key: 'dette', color: '#ff8f45', name: 'dette 7 j' },
            ]}
            reference={data.settings.sleepGoalHours}
            height={170}
          />
          <div className="mt-1 flex gap-4 text-[0.68rem] text-mist-500">
            <span className="flex items-center gap-1.5">
              <Dot color="#9b7bff" size={6} /> Heures de sommeil
            </span>
            <span className="flex items-center gap-1.5">
              <Dot color="#ff8f45" size={6} /> Dette 7 jours
            </span>
          </div>
        </Card>

        <Card title="FC de repos & HRV" subtitle="Moyennes mobiles 5 jours">
          <SmoothLines
            data={healthSeries}
            series={[
              { key: 'fcRepos', color: '#ff8f45', name: 'FC repos' },
              { key: 'hrv', color: '#27e0c0', name: 'HRV' },
            ]}
            height={170}
          />
        </Card>

        <Card title="Poids" subtitle="Valeurs notées au check-in">
          <GlowArea data={healthSeries} dataKey="poids" color="#8fb4ff" unit="kg" height={170} />
        </Card>

        {practiced.length > 0 && (
          <Card
            title="Volume par exercice"
            subtitle="Par semaine"
            action={
              <div className="w-40">
                <Select
                  value={activeExercise}
                  onChange={setExerciseId}
                  options={practiced.map((e) => ({ value: e.id, label: e.name }))}
                />
              </div>
            }
          >
            <Bars
              data={exerciseSeries}
              series={[
                { key: 'reps', color: 'var(--accent)', name: 'reps' },
              ]}
              height={160}
            />
            <SmoothLines
              data={exerciseSeries}
              series={[{ key: 'record', color: '#41e08a', name: '1RM estimé (kg)' }]}
              height={130}
            />
          </Card>
        )}

        <Card title="Corrélations" subtitle="Sur la période choisie">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-mist-300">Sommeil → récupération du lendemain</span>
                <span className="text-mist-500 tnum">
                  {correlations.rSleep === null ? '—' : `r = ${correlations.rSleep.toFixed(2)}`}
                </span>
              </div>
              <Correlation
                data={correlations.sleepVsRecovery}
                xKey="x"
                yKey="y"
                xLabel="Heures de sommeil"
                yLabel="Récup. J+1"
                color="#9b7bff"
                height={170}
              />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-mist-300">Charge → récupération du lendemain</span>
                <span className="text-mist-500 tnum">
                  {correlations.rLoad === null ? '—' : `r = ${correlations.rLoad.toFixed(2)}`}
                </span>
              </div>
              <Correlation
                data={correlations.loadVsRecovery}
                xKey="x"
                yKey="y"
                xLabel="Charge du jour"
                yLabel="Récup. J+1"
                color="var(--accent)"
                height={170}
              />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-mist-300">HRV → FC de repos</span>
                <span className="text-mist-500 tnum">
                  {correlations.rHrv === null ? '—' : `r = ${correlations.rHrv.toFixed(2)}`}
                </span>
              </div>
              <Correlation
                data={correlations.hrvVsRhr}
                xKey="x"
                yKey="y"
                xLabel="HRV (ms)"
                yLabel="FC repos (bpm)"
                color="#27e0c0"
                height={170}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}
