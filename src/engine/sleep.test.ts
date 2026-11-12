import { describe, expect, it } from 'vitest'
import { computeSleepScore, sleepDebtHours, sleepHours, sleepRegularity, sleepWindow } from './sleep'
import { badNight, goodNight, makeCheckIn } from '../test/fixtures'
import type { CheckIn, DayKey } from '../types'
import { addDayKey } from './time'

const mapOf = (list: CheckIn[]) => new Map<DayKey, CheckIn>(list.map((c) => [c.day, c]))

describe('sommeil', () => {
  it('note une bonne nuit nettement au-dessus d’une mauvaise', () => {
    const good = computeSleepScore(mapOf([goodNight('2025-06-03')]), '2025-06-03', 8)
    const bad = computeSleepScore(mapOf([badNight('2025-06-03')]), '2025-06-03', 8)
    expect(good.score).toBeGreaterThan(80)
    expect(bad.score).toBeLessThan(65)
    expect(good.score - bad.score).toBeGreaterThan(25)
    expect(good.durationPart).toBeCloseTo(40, 1)
  })

  it('renvoie un score nul mais pas d’erreur sans données', () => {
    const s = computeSleepScore(new Map(), '2025-06-03', 8)
    expect(s.score).toBe(0)
    expect(s.hours).toBeNull()
  })

  it('déduit les heures depuis les phases ou les horaires', () => {
    expect(
      sleepHours(makeCheckIn('2025-06-03', { sleep: { lightMin: 240, deepMin: 90, remMin: 90 } })),
    ).toBeCloseTo(7)
    expect(
      sleepHours(
        makeCheckIn('2025-06-03', {
          sleep: { bedtime: '2025-06-02T23:00:00.000Z', wakeTime: '2025-06-03T06:30:00.000Z' },
        }),
      ),
    ).toBeCloseTo(7.5)
    expect(sleepHours(makeCheckIn('2025-06-03'))).toBeNull()
  })

  it('cumule la dette de sommeil sur 7 jours', () => {
    const days: CheckIn[] = []
    for (let i = 0; i < 7; i++) {
      days.push(
        makeCheckIn(addDayKey('2025-06-07', -i), { sleep: { hours: 6.5 } }),
      )
    }
    expect(sleepDebtHours(mapOf(days), '2025-06-07', 8)).toBeCloseTo(7 * 1.5)
  })

  it('mesure la régularité des horaires', () => {
    const regular: CheckIn[] = []
    const chaotic: CheckIn[] = []
    for (let i = 0; i < 7; i++) {
      const day = addDayKey('2025-06-07', -i)
      const prev = addDayKey(day, -1)
      regular.push(
        makeCheckIn(day, {
          sleep: {
            hours: 8,
            bedtime: `${prev}T23:00:00.000Z`,
            wakeTime: `${day}T07:00:00.000Z`,
          },
        }),
      )
      chaotic.push(
        makeCheckIn(day, {
          sleep: {
            hours: 7,
            bedtime: `${prev}T${String(19 + (i % 5)).padStart(2, '0')}:00:00.000Z`,
            wakeTime: `${day}T${String(4 + (i % 5)).padStart(2, '0')}:00:00.000Z`,
          },
        }),
      )
    }
    const a = sleepRegularity(mapOf(regular), '2025-06-07')!
    const b = sleepRegularity(mapOf(chaotic), '2025-06-07')!
    expect(a).toBeGreaterThan(b)
    expect(a).toBeCloseTo(100, 0)
  })

  it('reconstitue une fenêtre de sommeil même sans horaires', () => {
    const w = sleepWindow(makeCheckIn('2025-06-03', { sleep: { hours: 7 } }), '2025-06-03')!
    expect(new Date(w.start).getHours()).toBe(23)
    expect((w.end - w.start) / 3_600_000).toBeCloseTo(7)
    expect(sleepWindow(undefined, '2025-06-03')).toBeNull()
  })
})

describe('score de sommeil WHOOP', () => {
  it('une nuit WHOOP garde la performance de sommeil de WHOOP', () => {
    const night: CheckIn = { id: '2026-11-12', day: '2026-11-12', source: 'whoop', updatedAt: '', sleep: { hours: 7.5, quality: 78, deepMin: 90, remMin: 100 } }
    expect(computeSleepScore(new Map([[night.day, night]]), night.day, 8).score).toBe(78)
  })
  it('une nuit saisie à la main utilise notre calcul', () => {
    const night: CheckIn = { id: '2026-11-12', day: '2026-11-12', source: 'manual', updatedAt: '', sleep: { hours: 7.5, quality: 78, deepMin: 90, remMin: 100 } }
    expect(computeSleepScore(new Map([[night.day, night]]), night.day, 8).score).not.toBe(78)
  })
})
