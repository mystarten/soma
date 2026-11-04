import type { CardioScore, CheckIn, DayKey, HrZones, Workout } from '../types'
import { clamp, mean } from './stats'
import { lastDays } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Score cardio (0 → 100, 100 = excellent) :
     HRV vs base 30 j 40 % · FC repos vs base 30 % · charge zones 4-5 30 %
   ────────────────────────────────────────────────────────────────────────── */

export function baseline(
  byDay: Map<DayKey, CheckIn>,
  day: DayKey,
  pick: (c: CheckIn) => number | undefined,
  days = 30,
): number | null {
  const vals: number[] = []
  for (const k of lastDays(day, days)) {
    const v = pick(byDay.get(k) ?? ({} as CheckIn))
    if (typeof v === 'number' && v > 0) vals.push(v)
  }
  return vals.length >= 3 ? mean(vals) : null
}

/** Minutes en zones 4 et 5 sur les 7 derniers jours. */
export function highZoneMinutes(workouts: Workout[], day: DayKey, hrZones?: HrZones): number {
  const days = new Set(lastDays(day, 7))
  let total = 0
  for (const w of workouts) {
    if (w.deleted || w.planned || !days.has(w.day)) continue
    if (w.hrZoneMinutes) {
      total += (w.hrZoneMinutes[3] ?? 0) + (w.hrZoneMinutes[4] ?? 0)
      continue
    }
    const avg = w.avgHr ?? w.run?.avgHr ?? w.cardio?.avgHr
    if (avg && hrZones) {
      if (avg >= hrZones.bounds[3]) total += w.durationMin
    } else if ((w.rpe ?? 0) >= 8) {
      total += w.durationMin * 0.4
    }
  }
  return total
}

export function computeCardioScore(
  byDay: Map<DayKey, CheckIn>,
  day: DayKey,
  workouts: Workout[],
  hrZones?: HrZones,
): CardioScore {
  const today = byDay.get(day)
  const hrvBaseline = baseline(byDay, day, (c) => c.hrv)
  const rhrBaseline = baseline(byDay, day, (c) => c.restingHr)
  const hrv = today?.hrv
  const rhr = today?.restingHr

  const hrvDeltaPct =
    hrv && hrvBaseline ? ((hrv - hrvBaseline) / hrvBaseline) * 100 : null
  const rhrDelta = rhr && rhrBaseline ? rhr - rhrBaseline : null

  const hrvPart =
    hrvDeltaPct === null ? 0.65 * 40 : clamp(0.5 + (hrvDeltaPct / 100) * 2.5, 0, 1) * 40
  const rhrPart = rhrDelta === null ? 0.65 * 30 : clamp(0.5 - rhrDelta / 10, 0, 1) * 30

  const highZoneMinutes7d = highZoneMinutes(workouts, day, hrZones)
  /* Jusqu'à 90 min en zones 4-5 : optimal. Au-delà, le score baisse doucement. */
  const loadPart = clamp(1 - Math.max(0, highZoneMinutes7d - 90) / 180, 0, 1) * 30

  return {
    score: clamp(hrvPart + rhrPart + loadPart, 0, 100),
    hrvDeltaPct,
    rhrDelta,
    hrvBaseline,
    rhrBaseline,
    highZoneMinutes7d,
  }
}

/** Zones de FC par défaut (Karvonen simplifié sur FC max estimée). */
export function defaultHrZones(age = 30): HrZones {
  const maxHr = Math.round(208 - 0.7 * age)
  return {
    maxHr,
    bounds: [
      Math.round(maxHr * 0.5),
      Math.round(maxHr * 0.6),
      Math.round(maxHr * 0.7),
      Math.round(maxHr * 0.8),
      Math.round(maxHr * 0.9),
    ],
  }
}

export function hrZoneOf(hr: number, zones: HrZones): 1 | 2 | 3 | 4 | 5 {
  const b = zones.bounds
  if (hr >= b[4]) return 5
  if (hr >= b[3]) return 4
  if (hr >= b[2]) return 3
  if (hr >= b[1]) return 2
  return 1
}
