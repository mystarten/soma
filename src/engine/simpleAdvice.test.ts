import { describe, expect, it } from 'vitest'
import { pickSuggestion, simpleAdvice, trainingStreak } from './simpleAdvice'
import type { SocleRotation } from './rotation'

const w = (day: string) => ({ day })

describe('conseil simple', () => {
  it('compte les jours d’affilée', () => {
    expect(trainingStreak([w('2026-03-18'), w('2026-03-17'), w('2026-03-15')], '2026-03-18')).toEqual({ days: 2, todayDone: true })
    expect(trainingStreak([w('2026-03-17'), w('2026-03-16')], '2026-03-18')).toEqual({ days: 2, todayDone: false })
    expect(trainingStreak([{ day: '2026-03-18', backfill: true }], '2026-03-18').days).toBe(0)
  })
  it('conseille repos après 2 ou 3 jours de suite', () => {
    expect(simpleAdvice({ streak: 3, todayDone: false, restEvery: 3 }).rest).toBe(true)
    expect(simpleAdvice({ streak: 2, todayDone: false, restEvery: 3 }).rest).toBe(false)
    expect(simpleAdvice({ streak: 2, todayDone: false, restEvery: 2 }).rest).toBe(true)
    expect(simpleAdvice({ streak: 3, todayDone: true, restEvery: 3 }).title).toContain('repos demain')
    expect(simpleAdvice({ streak: 0, todayDone: false, restEvery: 3 }).title).toContain('Séance conseillée')
  })
  it('propose la séance restée le plus longtemps sans être faite', () => {
    const item = (code: string, socle: string, last?: string) => ({ code, title: code, socle, doneWeeks: [], nextWeek: 1, state: 'available' as const, lastDoneAt: last })
    const rot = [
      { socle: 'street', label: '', items: [], available: [item('T1', 'street', '2026-03-17T10:00:00Z')], waiting: [], finished: [], doneTotal: 0, weeksTotal: 0 },
      { socle: 'abdos', label: '', items: [], available: [item('A1', 'abdos', '2026-03-10T10:00:00Z')], waiting: [], finished: [], doneTotal: 0, weeksTotal: 0 },
    ] as SocleRotation[]
    expect(pickSuggestion(rot)?.code).toBe('A1')
    expect(pickSuggestion([])).toBeNull()
  })
})
