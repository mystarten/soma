import { useSoma } from '../../hooks/useSoma'
import type { Program, Workout } from '../../types'
import { CATEGORY_COLOR, categoryOf } from '../../engine/calendar'
import { socleOf } from '../../engine/rotation'
import { completePlanned } from '../../engine/autoDone'
import { saveWorkout } from '../../db/repo'
import { uid } from '../../db/db'
import { mergeProgramWithWhoop } from '../../db/seed'
import { Button } from '../ui/primitives'

/** Les séances que tu as placées aujourd'hui : « Lancer » pour le street, les abdos et les jambes (chrono de repos), « Faite ✓ » pour tout le reste. */
export default function TodaySessions({ program, onRun, onDone }: { program: Program; onRun: (w: Workout) => void; onDone: (message: string) => void }) {
  const data = useSoma()
  const list = data.workouts.filter((w) => w.planned && !w.deleted && w.plan?.status !== 'sautee' && w.day === data.today).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  if (!list.length) return null
  return (
    <section className="rounded-[var(--radius-card)] p-4 hairline" aria-label="Prévu aujourd’hui">
      <h2 className="text-lg font-semibold text-mist-100">Prévu aujourd’hui</h2>
      <p className="mt-0.5 text-xs text-mist-500">Ce que tu as placé. Ce qui reste sera compté comme fait à la fin de la journée.</p>
      <ul className="mt-3 space-y-3">
        {list.map((w) => {
          const ref = w.program?.[0]
          const launchable = !!ref && socleOf(ref.code) !== 'course' && program.sessions.some((s) => s.code === ref.code)
          return (
            <li key={w.id} className="rounded-2xl bg-white/4 p-3.5 hairline" style={{ borderLeft: `3px solid ${CATEGORY_COLOR[categoryOf(w)]}` }}>
              <p className="text-base font-medium text-mist-100">{w.title}</p>
              <p className="text-xs text-mist-500">{w.durationMin} min</p>
              <div className={`mt-2.5 grid gap-2.5 ${launchable ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {launchable && <Button variant="primary" onClick={() => onRun(w)}>▶ Lancer</Button>}
                <Button
                  onClick={async () => {
                    await saveWorkout(completePlanned(w, program, () => uid('set')))
                    await mergeProgramWithWhoop()
                    onDone(`${w.title} faite ✓`)
                  }}
                >
                  ✓ Faite
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
