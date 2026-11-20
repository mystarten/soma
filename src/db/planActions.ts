import type { Program, Workout } from '../types'
import type { PlanDiff } from '../engine/planStore'
import { expiredAuto, entryToWorkout } from '../engine/planStore'
import { deleteWorkout, saveWorkouts } from './repo'

/** Enregistre le plan : les nouvelles séances prévues, les retraits, et les propositions passées non faites marquées « sautées ». */
export async function applyPlan(diff: PlanDiff, workouts: Workout[], today: string): Promise<void> {
  const now = new Date().toISOString()
  for (const w of diff.remove) await deleteWorkout(w.id)
  const expired = expiredAuto(workouts, today).map((w) => ({ ...w, plan: { ...w.plan, status: 'sautee' as const } }))
  const rows = [...diff.add.map((e) => entryToWorkout(e, now)), ...expired]
  if (rows.length) await saveWorkouts(rows)
}

export type { Program }

import type { PlanPreview } from '../engine/planStore'

/** Applique un aperçu validé : la séance déplacée (verrouillée), les retraits, les ajouts. */
export async function applyPreview(p: PlanPreview, workouts: Workout[], today: string): Promise<void> {
  for (const w of p.dropped) await deleteWorkout(w.id)
  if (p.moved) await saveWorkouts([p.moved])
  await applyPlan(p.diff, workouts, today)
}
