import type { ExerciseDef, ExerciseReference, SetEntry } from '../types'
import { clamp } from './stats'

/* ──────────────────────────────────────────────────────────────────────────
   Force : 1RM estimé (Epley) et reps max possibles à une charge donnée.
   Pour les mouvements au poids du corps, la « charge » est
   poids du corps × bodyweightFactor + lest.
   ────────────────────────────────────────────────────────────────────────── */

/** Epley : 1RM = charge × (1 + reps / 30). */
export function epley1RM(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0
  return loadKg * (1 + reps / 30)
}

/** Inverse d'Epley : reps réalisables à `loadKg` pour un 1RM donné. */
export function repsAtLoad(oneRM: number, loadKg: number): number {
  if (loadKg <= 0 || oneRM <= 0) return 0
  if (loadKg >= oneRM) return 1
  return Math.max(1, 30 * (oneRM / loadKg - 1))
}

export interface StrengthContext {
  bodyWeightKg: number
  references: ExerciseReference[]
}

/** Charge totale déplacée par une série. */
export function totalLoadKg(
  ex: ExerciseDef,
  set: Pick<SetEntry, 'loadKg'>,
  bodyWeightKg: number,
): number {
  const bwPart = (ex.bodyweightFactor ?? 0) * bodyWeightKg
  return Math.max(1, bwPart + (set.loadKg ?? 0))
}

/** Référence effective : réglage personnel s'il existe, sinon valeur de l'exercice. */
export function referenceFor(
  ex: ExerciseDef,
  ctx: StrengthContext,
): { reps: number; loadKg: number; holdSec: number } {
  const custom = ctx.references.find((r) => r.exerciseId === ex.id)
  return {
    reps: custom?.reps ?? ex.referenceReps ?? 0,
    loadKg: custom?.loadKg ?? ex.referenceLoadKg ?? 0,
    holdSec: custom?.holdSec ?? ex.referenceHoldSec ?? 0,
  }
}

/** 1RM estimé pour un exercice, à partir de la référence personnelle. */
export function estimated1RM(ex: ExerciseDef, ctx: StrengthContext): number {
  const ref = referenceFor(ex, ctx)
  if (!ref.reps) return 0
  const refLoad = totalLoadKg(ex, { loadKg: ref.loadKg }, ctx.bodyWeightKg)
  return epley1RM(refLoad, ref.reps)
}

/** Reps max estimées à la charge d'une série donnée. */
export function repsMaxAtSetLoad(ex: ExerciseDef, set: SetEntry, ctx: StrengthContext): number {
  const oneRM = estimated1RM(ex, ctx)
  if (!oneRM) return 0
  return repsAtLoad(oneRM, totalLoadKg(ex, set, ctx.bodyWeightKg))
}

/**
 * Effort relatif d'une série, borné par `cap`.
 * – dynamique : reps / reps max à cette charge
 * – statique  : tenue / record de tenue
 */
export function setEffort(
  ex: ExerciseDef,
  set: SetEntry,
  ctx: StrengthContext,
  cap: number,
  failureBonus: number,
): { effort: number; intensity: number } {
  let ratio = 0
  if (ex.kind === 'static') {
    const ref = referenceFor(ex, ctx)
    const hold = set.holdSec ?? 0
    ratio = ref.holdSec > 0 ? hold / ref.holdSec : hold / 30
  } else {
    const reps = set.reps ?? 0
    const rm = repsMaxAtSetLoad(ex, set, ctx)
    ratio = rm > 0 ? reps / rm : 0
  }
  if (!Number.isFinite(ratio) || ratio <= 0) return { effort: 0, intensity: 0 }
  const capped = Math.min(ratio, cap)
  const effort = capped * (set.failure ? failureBonus : 1)
  /* Pic d'intensité : proximité de l'échec, borné à 1. */
  const intensity = clamp(ratio, 0, 1)
  return { effort, intensity }
}

/** Volume d'une série : reps × charge totale (tonnage), ou tenue × charge. */
export function setTonnage(ex: ExerciseDef, set: SetEntry, bodyWeightKg: number): number {
  const load = totalLoadKg(ex, set, bodyWeightKg)
  if (ex.kind === 'static') return ((set.holdSec ?? 0) / 3) * load
  return (set.reps ?? 0) * load
}

/** 1RM estimé observé sur une série réelle (pour les records). */
export function set1RM(ex: ExerciseDef, set: SetEntry, bodyWeightKg: number): number {
  if (ex.kind === 'static') return 0
  const reps = set.reps ?? 0
  if (reps <= 0) return 0
  return epley1RM(totalLoadKg(ex, set, bodyWeightKg), reps)
}

/** Projection d'allure (Riegel) : t2 = t1 × (d2/d1)^1.06. */
export function riegelProjection(
  knownDistanceM: number,
  knownDurationSec: number,
  targetDistanceM: number,
): number {
  if (knownDistanceM <= 0 || knownDurationSec <= 0) return 0
  return knownDurationSec * (targetDistanceM / knownDistanceM) ** 1.06
}
