/** Fixtures de test — uniquement de fausses données. */
import { EXERCISE_LIBRARY } from '../engine/muscleMap'
import { DEFAULT_FATIGUE_CONFIG } from '../engine/fatigueConfig'
import type { CheckIn, ExerciseDef, SetEntry, Workout } from '../types'
import type { FatigueContext } from '../engine/fatigue'

export const EXERCISES: ExerciseDef[] = EXERCISE_LIBRARY.map((e) => ({
  ...e,
  updatedAt: '2025-01-01T00:00:00.000Z',
}))

let n = 0
export const uid = (p = 'id') => `${p}_${++n}`

export function makeSet(exerciseId: string, over: Partial<SetEntry> = {}): SetEntry {
  return { id: uid('set'), exerciseId, ...over }
}

export function makeWorkout(over: Partial<Workout> = {}): Workout {
  const startedAt = over.startedAt ?? '2025-06-02T18:00:00.000Z'
  return {
    id: uid('w'),
    day: startedAt.slice(0, 10),
    startedAt,
    durationMin: 60,
    kind: 'street',
    source: 'manual',
    updatedAt: startedAt,
    ...over,
  }
}

export function makeCheckIn(day: string, over: Partial<CheckIn> = {}): CheckIn {
  return {
    id: day,
    day,
    source: 'manual',
    updatedAt: `${day}T07:00:00.000Z`,
    ...over,
  }
}

/** Nuit « correcte » : 8 h, phases équilibrées, bonne efficacité. */
export function goodNight(day: string, bedHour = 23): CheckIn {
  const prev = new Date(`${day}T00:00:00`)
  prev.setDate(prev.getDate() - 1)
  const bedtime = new Date(prev)
  bedtime.setHours(bedHour, 0, 0, 0)
  const wake = new Date(bedtime.getTime() + 8 * 3_600_000)
  return makeCheckIn(day, {
    recovery: 78,
    restingHr: 48,
    hrv: 95,
    sleep: {
      hours: 8,
      quality: 88,
      bedtime: bedtime.toISOString(),
      wakeTime: wake.toISOString(),
      deepMin: 110,
      remMin: 120,
      lightMin: 250,
      awakeMin: 20,
      efficiency: 94,
      consistency: 88,
      awakenings: 1,
    },
  })
}

/** Nuit « mauvaise » : 4 h 30, peu de profond, efficacité basse. */
export function badNight(day: string, bedHour = 1): CheckIn {
  const bedtime = new Date(`${day}T00:00:00`)
  bedtime.setHours(bedHour, 0, 0, 0)
  const wake = new Date(bedtime.getTime() + 4.5 * 3_600_000)
  return makeCheckIn(day, {
    recovery: 32,
    restingHr: 58,
    hrv: 52,
    sleep: {
      hours: 4.5,
      quality: 38,
      bedtime: bedtime.toISOString(),
      wakeTime: wake.toISOString(),
      deepMin: 35,
      remMin: 40,
      lightMin: 180,
      awakeMin: 60,
      efficiency: 76,
      consistency: 40,
      awakenings: 4,
    },
  })
}

export function ctx(over: Partial<FatigueContext> = {}): FatigueContext {
  return {
    workouts: [],
    checkins: [],
    exercises: EXERCISES,
    bodyWeightKg: 70,
    references: [],
    sleepGoalHours: 8,
    config: DEFAULT_FATIGUE_CONFIG,
    referencePaceSecPerKm: 240,
    ...over,
  }
}
