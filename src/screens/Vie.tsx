import { useMemo } from 'react'
import { useSoma } from '../hooks/useSoma'
import BodyView from '../components/body/BodyView'
import TodoPanel from '../components/vie/TodoPanel'
import DeadlinesPanel from '../components/vie/DeadlinesPanel'
import { Ring } from '../components/ui/Ring'
import { Button } from '../components/ui/primitives'
import { navigate } from '../lib/router'
import { taskLoad, tasksForView } from '../engine/tasks'
import { morningLoad } from '../engine/load'
import { bodySummary } from '../engine/fatigue'
import { fatigueColor } from '../engine/fatigueConfig'
import { zoneList } from '../engine/suggest'
import { reviewDone, reviewWeekFor } from '../engine/review'
import { useRotation } from '../components/program/useRotation'
import { useGoogle } from '../integrations/useGoogle'
import { AgendaPanel, MailPanel } from '../components/vie/GooglePanels'
import RecentWorkouts from '../components/vie/RecentWorkouts'
import NextSessions from '../components/vie/NextSessions'
import { sleepHours } from '../engine/sleep'

const recoveryColor = (v: number) => (v >= 67 ? '#41e08a' : v >= 34 ? '#ffc24b' : '#ff5a5a')

/** Une seule information mise en avant, le reste reste discret. */
function DayLine() {
  const data = useSoma()
  const load = taskLoad(data.tasks, data.today, data.settings.weekStartsOn)
  const next = tasksForView(data.tasks, 'today', data.today, data.settings.weekStartsOn)[0]
  let main: string
  let tone = 'var(--color-mist-100)'
  if (load.overdue > 0) {
    main = `${load.overdue} tâche${load.overdue > 1 ? 's' : ''} en retard`
    tone = '#ffb02e'
  } else if (next) {
    main = `Prochaine : ${next.title}`
  } else if (load.week > 0) {
    main = 'Rien d’urgent aujourd’hui'
  } else {
    main = 'Journée libre'
  }
  const rest = [
    load.today ? `${load.today} aujourd’hui` : null,
    load.highToday ? `${load.highToday} prioritaire${load.highToday > 1 ? 's' : ''}` : null,
    load.week ? `${load.week} cette semaine` : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
      <p className="text-base font-medium sm:text-lg" style={{ color: tone }}>
        {main}
      </p>
      {rest.length > 0 && <p className="text-xs text-mist-500">{rest.join(' · ')}</p>}
    </div>
  )
}

/** Brief du matin : trois phrases, calculées par des règles simples (pas d'IA externe). */
function MorningBrief() {
  const data = useSoma()
  const g = useGoogle()
  const { rotation } = useRotation()
  const lines: string[] = []
  const rec = data.checkinByDay.get(data.today)?.recovery
  if (typeof rec === 'number') {
    lines.push(
      rec >= 67 ? `Récupération à ${Math.round(rec)} % : bonne journée pour pousser.` : rec >= 34 ? `Récupération à ${Math.round(rec)} % : séance normale, sans forcer.` : `Récupération à ${Math.round(rec)} % : journée légère, mobilité ou marche.`,
    )
  } else lines.push('Pas encore de check-in ce matin : deux minutes pour calibrer la journée.')
  const today = g.agenda.filter((e) => e.day === data.today)
  if (today.length) lines.push(`Agenda : ${today.length} événement${today.length > 1 ? 's' : ''}, le premier à ${today[0].time ?? 'la journée'} (${today[0].title}).`)
  if (data.program && rotation.length) {
    const next = rotation
      .filter((r) => r.available.length)
      .map((r) => `${r.available.map((i) => `${i.code} (S${i.nextWeek})`).join(' ou ')}`)
    if (next.length) lines.push(`Programme : à faire — ${next.join(' · ')}.`)
  }
  if (!lines.length) return null
  return (
    <ul className="rounded-xl bg-white/4 px-3.5 py-2.5 text-xs text-mist-300 hairline">
      {lines.map((l) => (
        <li key={l} className="flex gap-2 py-0.5">
          <span className="text-accent" aria-hidden>·</span>
          {l}
        </li>
      ))}
    </ul>
  )
}

/** Agenda et mails : seulement une fois Google connecté, pour ne pas encombrer l'accueil sinon. */
function GoogleOnHome() {
  const g = useGoogle()
  if (!g.connected && !g.agenda.length && !g.mails.length) return null
  return (
    <>
      <AgendaPanel />
      <MailPanel />
    </>
  )
}

/** Un rappel discret le week-end et le lundi, tant que la revue de la semaine n'est pas faite. */
function ReviewNudge() {
  const data = useSoma()
  const dow = new Date().getDay()
  const target = reviewWeekFor(data.today, data.settings.weekStartsOn)
  const done = reviewDone(data.reviews.find((r) => r.id === target.start))
  if (done || !(dow === 0 || dow === 6 || dow === 1)) return null
  return (
    <button
      onClick={() => navigate('revue')}
      className="flex items-center justify-between gap-2 rounded-xl bg-accent/8 px-3.5 py-2.5 text-left text-sm text-mist-100 hairline"
    >
      <span>{target.current ? 'La semaine se termine : ta revue ?' : 'Ta revue de la semaine dernière ?'}</span>
      <span className="text-accent">Deux minutes →</span>
    </button>
  )
}

function SportCard() {
  const data = useSoma()
  const checkin = data.checkinByDay.get(data.today)
  const recovery = checkin?.recovery ?? null
  const morning = useMemo(
    () => morningLoad(data.today, data.workouts, data.checkinByDay, data.loadCtx),
    [data.today, data.workouts, data.checkinByDay, data.loadCtx],
  )
  const load = morning.value
  const summary = useMemo(() => bodySummary(data.body), [data.body])
  const sleep = data.sleepScore.score
  /* La nuit en détail : durée, sommeil profond et paradoxal, VFC, fréquence cardiaque de repos. */
  const nightLine = (() => {
    const c = data.checkinByDay.get(data.today)
    const h = sleepHours(c)
    if (!c || h === null) return null
    const fmt = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`
    const parts = [`Nuit ${fmt(h * 60)}`]
    if (c.sleep?.deepMin) parts.push(`profond ${fmt(c.sleep.deepMin)}`)
    if (c.sleep?.remMin) parts.push(`paradoxal ${fmt(c.sleep.remMin)}`)
    if (c.hrv) parts.push(`VFC ${Math.round(c.hrv)} ms`)
    if (c.restingHr) parts.push(`FC repos ${Math.round(c.restingHr)}`)
    return parts.join(' · ')
  })()
  return (
    <section aria-label="Sport et récupération" className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-medium text-mist-100">Sport & récupération</h3>
        <button onClick={() => navigate('sport')} className="text-xs text-accent">
          Tableau sport →
        </button>
      </div>
      <div className="flex justify-around">
        <Ring
          value={recovery ?? 0}
          display={recovery === null ? '—' : String(Math.round(recovery))}
          unit="%"
          color={recovery === null ? '#5a6c86' : recoveryColor(recovery)}
          label="Récup."
          size={74}
          thickness={7}
        />
        <Ring value={load} max={21} display={load.toFixed(1)} unit="/21" label={morning.label === 'Hier' ? 'Charge hier' : 'Charge'} size={74} thickness={7} />
        <Ring
          value={sleep}
          display={sleep > 0 ? String(Math.round(sleep)) : '—'}
          unit="%"
          color={sleep > 0 ? fatigueColor(100 - sleep) : '#5a6c86'}
          label="Sommeil"
          size={74}
          thickness={7}
        />
      </div>
      {nightLine && <p className="mt-3 text-xs text-mist-300">{nightLine}</p>}
      <div className="mt-3 space-y-1 text-xs">
        {summary.careful.length > 0 && (
          <p className="text-mist-300">
            <span className="text-mist-500">À ménager · </span>
            {zoneList(summary.careful, 4)}
          </p>
        )}
        <p className="text-mist-300">
          <span className="text-mist-500">Prêt · </span>
          {summary.ready.length ? zoneList(summary.ready, 4) : 'rien de totalement frais'}
        </p>
      </div>
      {recovery === null && (
        <Button variant="primary" full className="mt-3" onClick={() => navigate('checkin')}>
          Faire mon check-in
        </Button>
      )}
    </section>
  )
}

export default function Vie() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)_minmax(0,0.9fr)]">
      {/* Centre : le bonhomme, puis la to-do */}
      <div className="flex min-w-0 flex-col gap-4 lg:row-span-2 xl:col-start-2 xl:row-span-1 xl:row-start-1">
        <DayLine />
        <MorningBrief />
        <ReviewNudge />
        <BodyView hero />
        <TodoPanel initialView="week" />
      </div>
      {/* Échéances */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-1 xl:row-start-1">
        <DeadlinesPanel />
        <GoogleOnHome />
      </div>
      {/* Sport */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-3 xl:row-start-1">
        <SportCard />
        <NextSessions />
        <RecentWorkouts />
      </div>
    </div>
  )
}
