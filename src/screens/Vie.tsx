import { useMemo } from 'react'
import { useSoma } from '../hooks/useSoma'
import BodyView from '../components/body/BodyView'
import TodoPanel from '../components/vie/TodoPanel'
import DeadlinesPanel from '../components/vie/DeadlinesPanel'
import { Ring } from '../components/ui/Ring'
import { Button } from '../components/ui/primitives'
import { navigate } from '../lib/router'
import { taskLoad, tasksForView } from '../engine/tasks'
import { dayLoad } from '../engine/load'
import { bodySummary } from '../engine/fatigue'
import { fatigueColor } from '../engine/fatigueConfig'
import { zoneList } from '../engine/suggest'

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

function SportCard() {
  const data = useSoma()
  const checkin = data.checkinByDay.get(data.today)
  const recovery = checkin?.recovery ?? null
  const load = useMemo(
    () => dayLoad(data.today, data.workouts, data.checkinByDay, data.loadCtx).load,
    [data.today, data.workouts, data.checkinByDay, data.loadCtx],
  )
  const summary = useMemo(() => bodySummary(data.body), [data.body])
  const sleep = data.sleepScore.score
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
        <Ring value={load} max={21} display={load.toFixed(1)} unit="/21" label="Charge" size={74} thickness={7} />
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
        <BodyView hero />
        <TodoPanel />
      </div>
      {/* Échéances */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-1 xl:row-start-1">
        <DeadlinesPanel />
      </div>
      {/* Sport */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 xl:col-start-3 xl:row-start-1">
        <SportCard />
      </div>
    </div>
  )
}
