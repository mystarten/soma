import { describe, expect, it } from 'vitest'
import type { CheckIn } from '../types'
import { addDayKey, lastDays } from './time'
import { goodTimeForTest, overloadAt, overloadSeries, type OverloadContext } from './overload'
import { EXERCISES, makeCheckIn, makeWorkout } from '../test/fixtures'

const today = '2026-03-18'

function ctx(checkins: CheckIn[], workouts = [] as ReturnType<typeof makeWorkout>[]): OverloadContext {
  return {
    byDay: new Map(checkins.map((c) => [c.day, c])),
    checkins,
    workouts,
    exercises: EXERCISES,
    loadCtx: { exercises: EXERCISES, bodyWeightKg: 70 },
    sleepGoal: 8,
  }
}

const days = (n: number, f: (i: number, day: string) => Partial<CheckIn>) =>
  lastDays(today, n).map((d, i) => makeCheckIn(d, f(i, d)))

describe('charge de fond', () => {
  it('reste basse quand tout va bien', () => {
    const cks = days(30, () => ({ recovery: 78, hrv: 90, restingHr: 52, sleep: { hours: 8.2 } }))
    const r = overloadAt(today, ctx(cks))
    expect(r.score).not.toBeNull()
    expect(r.score!).toBeLessThan(35)
    expect(r.level).toBe('ok')
  })

  it('monte nettement quand tout se dégrade (déload conseillé)', () => {
    const cks = days(30, (i) => (i >= 23 ? { recovery: 28, hrv: 55, restingHr: 62, sleep: { hours: 5.4 } } : { recovery: 75, hrv: 90, restingHr: 52, sleep: { hours: 8 } }))
    const workouts = lastDays(today, 14).map((d) => makeWorkout({ day: d, startedAt: `${d}T18:00:00.000Z`, durationMin: 70, rpe: 9 }))
    const r = overloadAt(today, ctx(cks, workouts))
    expect(r.score!).toBeGreaterThanOrEqual(70)
    expect(r.drivers.length).toBeGreaterThan(0)
  })

  it('renvoie null sans assez de signaux', () => {
    expect(overloadAt(today, ctx([])).score).toBeNull()
  })

  it('repondère si un signal manque et respecte le seuil réglé', () => {
    const cks = days(30, (i) => (i >= 23 ? { recovery: 30, hrv: 60 } : { recovery: 75, hrv: 90 }))
    const base = ctx(cks)
    const strict = overloadAt(today, { ...base, threshold: 30 })
    expect(strict.score).not.toBeNull()
    expect(strict.level).toBe('deload')
    expect(overloadAt(today, { ...base, threshold: 101 }).level).not.toBe('deload')
  })

  it('série et bon moment pour un test', () => {
    const cks = days(40, () => ({ recovery: 80, hrv: 90, restingHr: 50, sleep: { hours: 8 } }))
    const series = overloadSeries(today, ctx(cks), 7)
    expect(series).toHaveLength(7)
    expect(addDayKey(series[6].day, 0)).toBe(today)
    const r = overloadAt(today, ctx(cks))
    expect(goodTimeForTest(r, 80)).toBe(true)
    expect(goodTimeForTest(r, 50)).toBe(false)
  })
})
