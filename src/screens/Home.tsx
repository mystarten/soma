import { useMemo } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import { Badge, Button, Card, Dot, ProgressBar, SectionTitle, Stat } from '../components/ui/primitives'
import { Ring } from '../components/ui/Ring'
import { SmoothLines } from '../components/charts/charts'
import BodyView from '../components/body/BodyView'
import { navigate } from '../lib/router'
import { dayLoad, volumeSummary } from '../engine/load'
import { computeSleepScore } from '../engine/sleep'
import { lastDays, parseDay, weekBounds } from '../engine/time'
import { movingAverage } from '../engine/stats'
import { fatigueColor } from '../engine/fatigueConfig'
import { weeklySentence } from '../engine/goals'
import { LEVEL_COLOR, LEVEL_LABEL, visibleObservations } from '../engine/observations'
import { Spark } from '../components/charts/charts'

const recoveryColor = (v: number) => (v >= 67 ? '#41e08a' : v >= 34 ? '#ffc24b' : '#ff5a5a')

export default function Home() {
  const data = useSoma()
  const today = data.checkinByDay.get(data.today)
  const load = useMemo(
    () => dayLoad(data.today, data.workouts, data.checkinByDay, data.loadCtx).load,
    [data.today, data.workouts, data.checkinByDay, data.loadCtx],
  )
  const week = useMemo(() => weekBounds(data.today, data.settings.weekStartsOn), [data.today, data.settings.weekStartsOn])
  const weekWorkouts = useMemo(
    () => data.workouts.filter((w) => w.day >= week.start && w.day <= week.end),
    [data.workouts, week],
  )
  const weekVolume = useMemo(() => volumeSummary(weekWorkouts, data.loadCtx), [weekWorkouts, data.loadCtx])

  const days30 = useMemo(() => lastDays(data.today, 30), [data.today])
  const series = useMemo(() => {
    const rec = days30.map((d) => data.checkinByDay.get(d)?.recovery ?? null)
    const sleep = days30.map((d) =>
      data.checkinByDay.get(d)?.sleep
        ? computeSleepScore(data.checkinByDay, d, data.settings.sleepGoalHours).score
        : null,
    )
    const recAvg = movingAverage(rec, 5)
    const sleepAvg = movingAverage(sleep, 5)
    return days30.map((day, i) => ({
      day,
      recuperation: rec[i],
      sommeil: sleep[i],
      recuperationLissee: recAvg[i],
      sommeilLisse: sleepAvg[i],
    }))
  }, [days30, data.checkinByDay, data.settings.sleepGoalHours])

  const sentence = useMemo(
    () => weeklySentence(data.goalProgress, data.alignment),
    [data.goalProgress, data.alignment],
  )
  const observations = visibleObservations(data.observations, 2)

  const countdown = data.settings.countdown
  const daysLeft = countdown ? differenceInCalendarDays(parseDay(countdown.date), new Date()) : null

  const sleepPct = data.sleepScore.score
  const recovery = today?.recovery ?? null

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
      {/* ── Colonne 1 ── */}
      <div className="flex flex-col gap-3">
        <Card>
          <div className="flex items-start justify-around gap-2 pt-1">
            <Ring
              value={recovery ?? 0}
              display={recovery === null ? '—' : String(Math.round(recovery))}
              unit="%"
              color={recovery === null ? '#5a6c86' : recoveryColor(recovery)}
              label="Récupération"
              sublabel={recovery === null ? 'à noter' : undefined}
              size={104}
            />
            <Ring
              value={load}
              max={21}
              display={load.toFixed(1)}
              unit="/ 21"
              color="var(--accent)"
              label="Charge"
              sublabel={format(new Date(), 'd MMM', { locale: fr })}
              size={104}
              delay={120}
            />
            <Ring
              value={sleepPct}
              display={sleepPct > 0 ? String(Math.round(sleepPct)) : '—'}
              unit="%"
              color={sleepPct > 0 ? fatigueColor(100 - sleepPct) : '#5a6c86'}
              label="Sommeil"
              sublabel={
                data.sleepScore.hours !== null ? `${data.sleepScore.hours.toFixed(1)} h` : 'à noter'
              }
              size={104}
              delay={240}
            />
          </div>
          {recovery === null && (
            <Button variant="primary" full className="mt-3" onClick={() => navigate('checkin')}>
              Faire mon check-in du matin
            </Button>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">Alignement</div>
              <div className="flex items-baseline gap-2">
                <span
                  className="text-4xl font-semibold tnum"
                  style={{
                    color:
                      data.alignment >= 80 ? '#41e08a' : data.alignment >= 60 ? '#ffc24b' : '#ffb02e',
                  }}
                >
                  {data.alignment}
                </span>
                <span className="text-sm text-mist-500">/ 100</span>
              </div>
            </div>
            <div className="flex-1 text-right">
              <p className="text-xs leading-relaxed text-mist-300">{sentence}</p>
            </div>
          </div>
          <div className="mt-3">
            <ProgressBar
              ratio={data.alignment / 100}
              color={data.alignment >= 80 ? '#41e08a' : '#ffc24b'}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.goalProgress.slice(0, 4).map((p) => (
              <Badge
                key={p.goal.id}
                color={p.status === 'ok' ? '#41e08a' : p.status === 'mid' ? '#ffc24b' : '#ffb02e'}
              >
                {p.goal.name}
              </Badge>
            ))}
            {!data.goalProgress.length && (
              <button onClick={() => navigate('objectifs')} className="text-xs text-accent">
                Définir mes objectifs →
              </button>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <Stat
              label="FC repos"
              value={today?.restingHr ?? '—'}
              unit="bpm"
              hint={data.cardioScore.rhrBaseline ? `base ${Math.round(data.cardioScore.rhrBaseline)}` : undefined}
            />
          </Card>
          <Card>
            <Stat
              label="HRV"
              value={today?.hrv ?? '—'}
              unit="ms"
              hint={data.cardioScore.hrvBaseline ? `base ${Math.round(data.cardioScore.hrvBaseline)}` : undefined}
            />
          </Card>
          <Card>
            <Stat
              label="Séances"
              value={weekVolume.sessions}
              hint="cette semaine"
            />
          </Card>
          <Card>
            <Stat
              label="Volume"
              value={Math.round(weekVolume.minutes)}
              unit="min"
              hint={weekVolume.km > 0.2 ? `${weekVolume.km.toFixed(1)} km` : `${weekVolume.reps} reps`}
            />
          </Card>
        </div>

        {countdown && daysLeft !== null && (
          <Card onClick={() => navigate('reglages')}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">Objectif</div>
                <div className="truncate text-sm font-medium text-mist-100">{countdown.name}</div>
                <div className="text-xs text-mist-700">
                  {countdown.discipline ? `${countdown.discipline} · ` : ''}
                  {format(parseDay(countdown.date), 'd MMMM yyyy', { locale: fr })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold text-accent tnum">{Math.max(0, daysLeft)}</div>
                <div className="text-[0.65rem] text-mist-500">
                  {daysLeft >= 0 ? 'jours' : 'passé'}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ── Colonne 2 : le corps ── */}
      <div className="flex flex-col gap-3">
        <Card padded={false} className="overflow-hidden">
          <button
            onClick={() => navigate('corps')}
            className="flex w-full items-center justify-between px-4 pt-3 pb-1 text-left"
          >
            <div>
              <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">
                État du corps
              </div>
              <div className="text-sm text-mist-300">Touche pour l’écran complet →</div>
            </div>
          </button>
          <div className="px-2 pb-2">
            <BodyView compact />
          </div>
        </Card>
      </div>

      {/* ── Colonne 3 : courbes & observations ── */}
      <div className="flex flex-col gap-3 2xl:col-span-1 xl:col-span-2 2xl:col-start-3 2xl:row-start-1">
        <Card title="Récupération & sommeil" subtitle="30 jours, moyenne mobile">
          <SmoothLines
            data={series}
            yDomain={[0, 100]}
            series={[
              { key: 'recuperationLissee', color: '#41e08a', name: 'Récup.' },
              { key: 'sommeilLisse', color: '#9b7bff', name: 'Sommeil' },
            ]}
            height={190}
          />
          <div className="mt-1 flex gap-4 text-[0.68rem] text-mist-500">
            <span className="flex items-center gap-1.5">
              <Dot color="#41e08a" size={6} /> Récupération
            </span>
            <span className="flex items-center gap-1.5">
              <Dot color="#9b7bff" size={6} /> Score de sommeil
            </span>
          </div>
        </Card>

        {observations.length > 0 && (
          <div>
            <SectionTitle
              action={
                <button onClick={() => navigate('suivi')} className="text-[0.68rem] text-accent">
                  Tout voir
                </button>
              }
            >
              Suivi de fond
            </SectionTitle>
            <div className="flex flex-col gap-2">
              {observations.map((o) => (
                <Card key={o.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge color={LEVEL_COLOR[o.level]}>{LEVEL_LABEL[o.level]}</Badge>
                      <div className="mt-1.5 text-sm font-medium text-mist-100">{o.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-mist-300">{o.sentence}</p>
                    </div>
                    {o.series && o.series.length > 3 && (
                      <div className="w-24 shrink-0">
                        <Spark data={o.series} color={LEVEL_COLOR[o.level]} baseline={o.baseline} />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card title="Cette semaine" subtitle="Prévu contre réel">
          <div className="mt-2 space-y-2">
            {data.goalProgress.slice(0, 5).map((p) => (
              <div key={p.goal.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-mist-300">{p.goal.name}</span>
                  <span className="shrink-0 text-mist-500 tnum">
                    {Math.round(p.actual * 10) / 10} / {p.target} {p.label}
                  </span>
                </div>
                <ProgressBar
                  ratio={p.ratio}
                  height={6}
                  color={
                    p.status === 'ok' ? '#41e08a' : p.status === 'mid' ? '#ffc24b' : '#ffb02e'
                  }
                />
              </div>
            ))}
            {!data.goalProgress.length && (
              <p className="py-4 text-center text-xs text-mist-700">
                Aucun objectif actif. Des exemples t’attendent dans l’écran Objectifs.
              </p>
            )}
          </div>
        </Card>

        <Card title="Dernières séances" subtitle={`${data.workouts.length} au total`}>
          <div className="mt-2 space-y-1.5">
            {[...data.workouts]
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .slice(0, 4)
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => navigate('seances', w.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2 text-left text-xs hairline"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-mist-100">
                      {w.title || w.kind}
                    </span>
                    <span className="text-mist-700">
                      {format(parseDay(w.day), 'EEE d MMM', { locale: fr })} ·{' '}
                      {w.durationMin} min
                      {w.rpe ? ` · RPE ${w.rpe}` : ''}
                    </span>
                  </span>
                  {w.source === 'whoop' && <Badge color="#35e3ff">WHOOP</Badge>}
                </button>
              ))}
            {!data.workouts.length && (
              <p className="py-4 text-center text-xs text-mist-700">
                Pas encore de séance. Ajoute-en une depuis l’écran Séances, ou génère des données de
                démo dans Réglages.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
