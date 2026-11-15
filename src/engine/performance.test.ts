import { describe, expect, it } from 'vitest'
import type { CheckIn, Workout } from '../types'
import { addDayKey } from './time'
import { proteinCheck, restAdvice, streetStreak, buildInsights, consistency, perceptionGap, polarisation, recoveryAfterStrain, recoveryProfile, sleepStageShare, streakWeeks, trendOf, weeklyEffort } from './performance'

const today = '2026-03-18'
const ci = (day: string, p: Partial<CheckIn>): CheckIn => ({ id: day, day, source: 'whoop', updatedAt: '2026-01-01T00:00:00Z', ...p })
const wk = (day: string, p: Partial<Workout> = {}): Workout => ({ id: day + (p.title ?? ''), day, startedAt: `${day}T08:00:00Z`, durationMin: 45, kind: 'street', source: 'manual', updatedAt: day, ...p })

describe('performance', () => {
  it('compare 7 j à la base 30 j', () => {
    const m = new Map<string, CheckIn>()
    for (let i = 0; i < 30; i++) m.set(addDayKey(today, -i), ci(addDayKey(today, -i), { hrv: i < 7 ? 80 : 60 }))
    const hrv = recoveryProfile(m, today).find((p) => p.label === 'VFC')!
    expect(hrv.now).toBeCloseTo(80)
    expect(hrv.deltaPct!).toBeGreaterThan(10)
  })
  it('répartition du sommeil', () => {
    const m = new Map([[today, ci(today, { sleep: { hours: 8, deepMin: 100, remMin: 100, lightMin: 250, awakeMin: 30 } as never })]])
    const s = sleepStageShare(m, today)!
    expect(s.deep + s.rem + s.light + s.awake).toBeCloseTo(100)
  })
  it('récup du lendemain par effort', () => {
    const m = new Map<string, CheckIn>()
    for (let i = 1; i <= 6; i++) {
      const d = addDayKey(today, -i)
      m.set(d, ci(d, { whoopDayStrain: 17 }))
      m.set(addDayKey(d, 1), { ...(m.get(addDayKey(d, 1)) ?? ci(addDayKey(d, 1), {})), recovery: 40 })
    }
    const b = recoveryAfterStrain(m, today)
    expect(b[3].value).toBeCloseTo(40)
    expect(b[0].value).toBeNull()
  })
  it('minutes par semaine, backfill exclu', () => {
    const rows = weeklyEffort([wk(today), wk(today, { kind: 'course', title: 'c' }), wk(today, { backfill: true, title: 'b' })], today, 4, 1)
    const last = rows[rows.length - 1]
    expect(last.force).toBe(45)
    expect(last.course).toBe(45)
    expect(last.sessions).toBe(2)
  })
  it('série de semaines', () => {
    expect(streakWeeks([{ sessions: 0 }, { sessions: 3 }, { sessions: 2 }, { sessions: 0 }], 2)).toBe(2)
    expect(consistency([], today, 3).length).toBe(3)
  })
  it('écart ressenti / montre et polarisation', () => {
    const ws = [1, 2, 3].map((i) => wk(addDayKey(today, -i), { rpe: 8, whoopStrain: 10, title: String(i) }))
    expect(perceptionGap(ws.map((w) => ({ day: w.day, title: '', rpe: w.rpe!, strain: w.whoopStrain! })))!).toBeCloseTo(6.8)
    expect(polarisation([10, 10, 60, 10, 10])!.mid).toBeCloseTo(60)
    expect(polarisation([1, 1, 1, 1, 1])).toBeNull()
  })
  it('tendance', () => {
    expect(trendOf('x', [10, 10, 10, 20, 20, 20])!.changePct).toBeCloseTo(100)
    expect(trendOf('x', [1, 2])).toBeNull()
  })
  it('constats classés par poids', () => {
    const m = new Map<string, CheckIn>()
    for (let i = 0; i < 30; i++) m.set(addDayKey(today, -i), ci(addDayKey(today, -i), { hrv: i < 7 ? 40 : 70, sleep: { hours: 5.5 } as never }))
    const ins = buildInsights({ byDay: m, workouts: [], today, weekStart: 1, sleepGoal: 8 })
    expect(ins[0].weight).toBeGreaterThanOrEqual(ins[ins.length - 1].weight)
    expect(ins.some((i) => i.id === 'hrv' && i.tone === 'watch')).toBe(true)
    expect(ins.some((i) => i.id === 'sleep')).toBe(true)
  })

  it('compte les jours de street d’affilée', () => {
    const ws = [0, 1, 2, 4].map((i) => wk(addDayKey(today, -i), { kind: 'street', title: String(i) }))
    expect(streetStreak(ws, today).days).toBe(3)
    expect(streetStreak(ws.slice(1), today)).toMatchObject({ days: 2, todayDone: false })
    expect(streetStreak([], today).days).toBe(0)
  })
  it('conseille repos, séance légère ou séance pleine', () => {
    const base = { streak: 0, todayDone: false, restEvery: 3, recovery: 80, lastLoad: 8, hrvDeltaPct: 0 }
    expect(restAdvice({ ...base, streak: 3 }).title).toContain('repos')
    expect(restAdvice({ ...base, recovery: 20 }).tone).toBe('watch')
    expect(restAdvice({ ...base, streak: 2, recovery: 55 }).title).toContain('légère')
    expect(restAdvice(base).tone).toBe('good')
  })
  it('juge les protéines au kilo', () => {
    expect(proteinCheck(100, 70).verdict).toBe('bas')
    expect(proteinCheck(130, 70).verdict).toBe('ok')
    expect(proteinCheck(130, 70).low).toBe(112)
  })
})
