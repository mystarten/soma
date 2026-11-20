import type { PlannedSet } from './program'

/* Course à pied : phases d'intervalles lues dans la prescription (« 5 x (3' trot + 1' marche) »), et conseil selon la douleur au tibia. */

export interface RunPhase {
  label: string
  sec: number
}

const QUOTE = `['’′]`
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/**
 * Lit une prescription de course : « 5 x (3' trot + 1' marche) », « 30' continu », « 10' marche + 20' trot ».
 * Renvoie les séries (une par phase, dans l'ordre) ou null si le texte n'en est pas une.
 */
export function parseRunText(t: string): PlannedSet[] | null {
  const m = new RegExp(`^(?:(\\d+)\\s*[x×]\\s*)?\\(?\\s*(\\d+\\s*(?:${QUOTE}|min\\s+(?=trot|marche|continu|footing|facile|course|récup))[^+()]*(?:\\+\\s*\\d+\\s*(?:${QUOTE}|min\\s+(?=trot|marche|continu|footing|facile|course|récup))[^+()]*)*)\\)?$`, 'i').exec(t.trim())
  if (!m) return null
  const repeat = m[1] ? Number(m[1]) : 1
  const parts = m[2].split('+').map((p) => new RegExp(`^\\s*(\\d+)\\s*(?:${QUOTE}|min)\\s*(.*?)\\s*$`, 'i').exec(p))
  if (parts.some((p) => !p) || repeat < 1 || repeat > 60) return null
  const phases = parts.map((p) => ({ sec: Number(p![1]) * 60, label: cap(p![2].trim().toLowerCase()) || 'Course' }))
  return Array.from({ length: repeat }, () => phases.map((p): PlannedSet => ({ workSec: p.sec, label: p.label, restSec: 0 }))).flat()
}

/** Les phases à chronométrer (trot, marche…) d'après les séries d'une séance de course. */
export function runPhases(sets: { workSec?: number; label?: string }[]): RunPhase[] {
  return sets.filter((s) => (s.workSec ?? 0) > 0).map((s) => ({ label: s.label ?? 'Course', sec: s.workSec! }))
}

/** Durée totale en minutes des phases. */
export const phasesMinutes = (p: RunPhase[]): number => Math.round(p.reduce((a, x) => a + x.sec, 0) / 60)

/** Un chrono d'intervalles n'a de sens que s'il y a au moins deux phases. */
export const hasIntervals = (p: RunPhase[]): boolean => p.length > 1

export const SHIN_LIMIT = 3

/** Conseil selon la douleur au tibia avant la sortie : un conseil, jamais un blocage. */
export function shinAdvice(pain: number | undefined): string | null {
  if (pain === undefined || pain <= SHIN_LIMIT) return null
  return 'Douleur au tibia au-dessus de 3 : remplace plutôt cette sortie par du vélo ou de la natation, et n’augmente pas la semaine suivante. À toi de décider.'
}
