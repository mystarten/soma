import { describe, expect, it } from 'vitest'
import { computeObservations, detectSustainedDeviation, visibleObservations, weeklyDigest } from './observations'
import type { CheckIn, DayKey } from '../types'
import { addDayKey, lastDays } from './time'
import { EXERCISES, makeCheckIn, makeSet, makeWorkout } from '../test/fixtures'

const TODAY: DayKey = '2025-06-30'

function series(values: (number | null)[]) {
  const days = lastDays(TODAY, values.length)
  return days.map((day, i) => ({ day, value: values[i] }))
}

describe('détection de tendance', () => {
  it('ignore un jour isolé', () => {
    const vals = Array.from({ length: 35 }, () => 70)
    vals[vals.length - 1] = 30
    const t = detectSustainedDeviation(series(vals), 'down')
    expect(t.active).toBe(false)
  })

  it('déclenche quand la déviation dure (moyenne mobile 7 j vs base 28 j)', () => {
    const vals: number[] = Array.from({ length: 40 }, (_, i) => (i % 2 ? 72 : 68))
    for (let i = vals.length - 9; i < vals.length; i++) vals[i] = 45
    const t = detectSustainedDeviation(series(vals), 'down')
    expect(t.active).toBe(true)
    expect(t.consecutiveDays).toBeGreaterThanOrEqual(5)
    expect(t.delta).toBeLessThan(0)
  })

  it('ne déclenche pas avec seulement 4 jours', () => {
    const vals: number[] = Array.from({ length: 40 }, (_, i) => (i % 2 ? 72 : 68))
    for (let i = vals.length - 4; i < vals.length; i++) vals[i] = 45
    expect(detectSustainedDeviation(series(vals), 'down').active).toBe(false)
  })

  it('reste inerte quand l’historique est trop court', () => {
    expect(detectSustainedDeviation(series([70, 60, 50]), 'down').active).toBe(false)
  })
})

describe('observations', () => {
  function baseCheckins(recovery: (i: number) => number, sleep: (i: number) => number): CheckIn[] {
    return lastDays(TODAY, 42).map((day, i) =>
      makeCheckIn(day, {
        recovery: recovery(i),
        restingHr: 50,
        hrv: 90,
        sleep: { hours: sleep(i), quality: 80, efficiency: 92, consistency: 85 },
      }),
    )
  }

  it('signale une récupération durablement basse, avec un ton neutre', () => {
    const checkins = baseCheckins(
      (i) => (i >= 35 ? 44 : 72 + (i % 3)),
      () => 7.8,
    )
    const obs = computeObservations({
      checkins,
      workouts: [],
      exercises: EXERCISES,
      bodyWeightKg: 70,
      sleepGoalHours: 8,
      today: TODAY,
    })
    const rec = obs.find((o) => o.id === 'recovery_down')
    expect(rec).toBeDefined()
    expect(rec!.level).toBe('note')
    expect(rec!.sentence).not.toMatch(/attention|danger|mauvais|échec/i)
    expect(rec!.series!.length).toBeGreaterThan(10)
  })

  it('n’affiche jamais plus de 3 observations', () => {
    const checkins = baseCheckins(
      (i) => (i >= 30 ? 40 : 75),
      (i) => (i >= 30 ? 4.5 : 8),
    )
    for (let i = 30; i < checkins.length; i++) {
      checkins[i].restingHr = 58
      checkins[i].hrv = 60
    }
    const obs = computeObservations({
      checkins,
      workouts: [],
      exercises: EXERCISES,
      bodyWeightKg: 70,
      sleepGoalHours: 8,
      today: TODAY,
    })
    expect(obs.length).toBeGreaterThanOrEqual(3)
    expect(visibleObservations(obs)).toHaveLength(3)
    /* Le niveau « à surveiller » reste rare et exige FC +5 et HRV −20 %. */
    const watch = obs.filter((o) => o.level === 'watch')
    expect(watch.length).toBeLessThanOrEqual(1)
  })

  it('ne dit rien quand tout est stable', () => {
    const checkins = baseCheckins(
      (i) => 72 + (i % 3),
      () => 8,
    )
    const obs = computeObservations({
      checkins,
      workouts: [],
      exercises: EXERCISES,
      bodyWeightKg: 70,
      sleepGoalHours: 8,
      today: TODAY,
    })
    expect(obs.filter((o) => o.level !== 'info')).toHaveLength(0)
  })

  it('repère un plateau sur un exercice', () => {
    const workouts = lastDays(TODAY, 30)
      .filter((_, i) => i % 3 === 0)
      .map((day, i) =>
        makeWorkout({
          day,
          startedAt: `${day}T18:00:00.000Z`,
          sets: [makeSet('ex_tractions_pronation', { reps: i < 2 ? 12 + i : 12 })],
        }),
      )
    const obs = computeObservations({
      checkins: [],
      workouts,
      exercises: EXERCISES,
      bodyWeightKg: 70,
      sleepGoalHours: 8,
      today: TODAY,
    })
    const plateau = obs.find((o) => o.id.startsWith('plateau_'))
    expect(plateau).toBeDefined()
    expect(plateau!.level).toBe('info')
  })

  it('produit un bilan hebdomadaire lisible', () => {
    const checkins = baseCheckins(
      () => 70,
      () => 7.5,
    )
    const workouts = lastDays(TODAY, 7)
      .slice(0, 4)
      .map((day) =>
        makeWorkout({
          day,
          startedAt: `${day}T18:00:00.000Z`,
          kind: 'course',
          durationMin: 45,
          run: { runType: 'footing', distanceM: 9000, durationSec: 2700 },
        }),
      )
    const lines = weeklyDigest({
      checkins,
      workouts,
      exercises: EXERCISES,
      bodyWeightKg: 70,
      sleepGoalHours: 8,
      today: TODAY,
    })
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(lines.join(' ')).toMatch(/séance/)
    expect(lines.join(' ')).toMatch(/km/)
  })

  it('tolère un historique vide', () => {
    const obs = computeObservations({
      checkins: [],
      workouts: [],
      exercises: EXERCISES,
      bodyWeightKg: 70,
      sleepGoalHours: 8,
      today: addDayKey(TODAY, 0),
    })
    expect(obs).toEqual([])
  })
})
