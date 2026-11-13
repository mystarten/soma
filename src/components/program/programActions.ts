import type { Program, Workout } from '../../types'
import { buildFromProgram } from '../../engine/program'
import { applyLight } from '../../engine/coach'
import { backfillMarks, removeRef } from '../../engine/rotation'
import { deleteWorkout, saveWorkout, saveWorkouts } from '../../db/repo'
import { uid } from '../../db/db'

/** Début réel d'une séance : jour choisi + heure `HH:MM`. */
export const startedAtOf = (day: string, time: string): string => {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0, 0, 0).toISOString()
}

export interface TickInput {
  program: Pick<Program, 'sessions'>
  code: string
  week: number
  day: string
  time: string
  rpe: number
  light?: boolean
}

/** Construit la séance cochée : les séries prévues, comme faites, reliées au corps et à la récupération. */
export function workoutFromTick(i: TickInput): Workout | null {
  const built = buildFromProgram(i.program, [{ code: i.code, week: i.week }], () => uid('set'))
  if (!built) return null
  const now = new Date().toISOString()
  return {
    id: uid('w'),
    day: i.day,
    startedAt: startedAtOf(i.day, i.time),
    durationMin: built.durationMin,
    kind: built.kind,
    title: i.light ? `${built.title} (légère)` : built.title,
    rpe: i.rpe,
    feeling: 3,
    notes: built.notes,
    sets: i.light ? applyLight(built.sets) : built.sets,
    program: built.program,
    source: 'manual',
    updatedAt: now,
  }
}

/** Coche une séance : l'enregistre dans le journal avec ses séries prévues. */
export async function tickSession(i: TickInput): Promise<Workout | null> {
  const w = workoutFromTick(i)
  if (w) await saveWorkout(w)
  return w
}

/** Retire la coche d'une séance/semaine, qu'elle vienne d'un enregistrement ou d'un rattrapage. */
export async function undoDone(all: Workout[], code: string, week: number): Promise<void> {
  for (const w of all) {
    const r = removeRef(w, code, week)
    if (r.action === 'delete') await deleteWorkout(w.id)
    else if (r.action === 'update') await saveWorkout({ ...w, program: r.program })
  }
}

/** « J'en suis à la semaine N » par socle : crée les coches de rattrapage. */
export async function saveProgress(program: Pick<Program, 'sessions'>, weeksBySocle: Record<string, number>): Promise<number> {
  const marks = backfillMarks(program, weeksBySocle, () => uid('mark'), new Date().toISOString())
  if (marks.length) await saveWorkouts(marks)
  return marks.length
}
