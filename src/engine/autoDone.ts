import type { Program, Workout } from '../types'
import { draftSession } from './programSession'
import { socleOf } from './rotation'

/* Une séance placée dans le calendrier devient « faite » quand on la valide, ou toute seule une fois sa journée passée :
   elle compte alors comme réalisée telle que prévue (séries du programme, course, natation, VTT) et fait avancer le programme. */

/** Les séances prévues dont le jour est passé. */
export const pastPlanned = (workouts: Workout[], today: string): Workout[] =>
  workouts.filter((w) => w.planned && !w.deleted && w.plan?.status !== 'sautee' && w.day < today)

/** La séance prévue, enregistrée comme faite telle que prévue. */
export function completePlanned(w: Workout, program: Pick<Program, 'sessions'> | null, makeId: () => string, auto = false): Workout {
  const ref = w.program?.[0]
  const isRun = !!ref && socleOf(ref.code) === 'course'
  const draft = ref && program ? draftSession(program, ref.code, ref.week, makeId) : null
  const noteBits = [w.notes?.trim() || draft?.notes, auto ? 'Marquée faite automatiquement (journée passée).' : ''].filter(Boolean)
  return {
    ...w,
    planned: undefined,
    plan: w.plan ? { ...w.plan, status: 'faite' } : undefined,
    sets: isRun ? undefined : w.sets?.length ? w.sets : draft?.sets,
    run: isRun ? { runType: 'footing', durationSec: Math.max(1, w.durationMin) * 60, ...w.run } : w.run,
    notes: noteBits.join('\n\n') || undefined,
    updatedAt: new Date().toISOString(),
  }
}
