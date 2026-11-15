import type { Program, Workout } from '../../types'
import { buildFromProgram } from '../../engine/program'
import { applyLight } from '../../engine/coach'
import { backfillMarks, removeRef, socleOf } from '../../engine/rotation'
import { deleteWorkout, saveWorkout, saveWorkouts } from '../../db/repo'
import { db, uid } from '../../db/db'
import { mergeProgramWithWhoop } from '../../db/seed'

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
  if (w) {
    await saveWorkout(w)
    await mergeProgramWithWhoop()
  }
  return w
}

/** Retire la coche d'une séance/semaine, qu'elle vienne d'un enregistrement ou d'un rattrapage. */
export async function undoDone(all: Workout[], code: string, week: number): Promise<void> {
  for (const w of all) {
    const r = removeRef(w, code, week)
    /* Une séance de la montre fusionnée avec le programme n'est pas supprimée : on lui retire seulement le détail du programme. */
    if (r.action === 'delete' && w.source === 'whoop') await saveWorkout({ ...w, program: undefined, sets: undefined, title: 'Street workout' })
    else if (r.action === 'delete') await deleteWorkout(w.id)
    else if (r.action === 'update') await saveWorkout({ ...w, program: r.program })
  }
}

/** « J'en suis à la semaine N » par socle : crée les coches de rattrapage. */
export async function saveProgress(program: Pick<Program, 'sessions'>, weeksBySocle: Record<string, number>): Promise<number> {
  /* On remplace les anciennes coches de ces familles : « j'en suis à la semaine 7 » corrige un réglage précédent. */
  const socles = new Set(Object.keys(weeksBySocle).filter((k) => (weeksBySocle[k] ?? 0) > 0))
  for (const old of await db.workouts.filter((w) => !!w.backfill && !w.deleted && (w.program ?? []).some((r) => socles.has(socleOf(r.code)))).toArray()) {
    await deleteWorkout(old.id)
  }
  const marks = backfillMarks(program, weeksBySocle, () => uid('mark'), new Date().toISOString())
  if (marks.length) await saveWorkouts(marks)
  return marks.length
}
