import { useSoma } from '../../hooks/useSoma'
import type { ProgramSession } from '../../types'
import { matchExercise, parseCell } from '../../engine/program'
import { observed1RM, recommendedLoadKg } from '../../engine/coach'
import { sessionExercises } from './advice'

/** Ce qui est prévu pour une semaine de la séance, bloc par bloc, avec le lest conseillé d'après tes séries. */
export default function SessionPreview({ session, week }: { session: ProgramSession; week: number }) {
  const data = useSoma()
  const wi = session.weeks.findIndex((w) => w.n === week)
  const exs = sessionExercises(session, data.exercises)
  if (wi < 0) return null
  /* Charge conseillée : seulement quand la case prévoit un lest et que tu as déjà des séries pour estimer ton 1RM. */
  const advice = (b: ProgramSession['blocks'][number]) => {
    const cell = parseCell(b.cells[wi] ?? '')
    const first = cell.sets[0]
    if (!first?.loadKg || !first.reps) return null
    const id = matchExercise(b.name, session.title).id
    const ex = exs.find((e) => e.id === id)
    if (!ex) return null
    const rm = observed1RM(ex, data.workouts, data.bodyWeightKg)
    const rec = recommendedLoadKg(ex, rm, first.reps, data.bodyWeightKg)
    return rec === null ? null : { rec, planned: first.loadKg }
  }
  return (
    <div className="mt-2 rounded-xl bg-white/4 p-2.5 text-xs hairline">
      <div className="mb-1 text-mist-500">
        Prévu · semaine {week} ({session.weeks[wi].label})
      </div>
      <ul className="flex flex-col gap-1">
        {session.blocks.map((b) => (
          <li key={b.name} className="flex gap-2">
            <span className="w-1/2 min-w-0 truncate text-mist-300">{b.name}</span>
            <span className="min-w-0 flex-1 text-mist-100">
              {b.cells[wi] || '—'}
              {(() => {
                const a = advice(b)
                return a ? <span className="block text-[0.65rem] text-mist-500">d’après tes séries : {a.rec > 0 ? '+' : ''}{a.rec} kg conseillés</span> : null
              })()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
