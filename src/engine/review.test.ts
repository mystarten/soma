import { describe, expect, it } from 'vitest'
import type { CheckIn, Task, Workout } from '../types'
import { insights, questionFor, reviewDone, reviewWeekFor, weekStats } from './review'

const w = (day: string, over: Partial<Workout> = {}): Workout => ({
  id: day + Math.random(), day, startedAt: day + 'T18:00:00Z', durationMin: 45, kind: 'street', source: 'manual', updatedAt: '', ...over,
})
const c = (day: string, recovery: number, hours: number): CheckIn => ({
  id: day, day, recovery, sleep: { hours }, source: 'manual', updatedAt: '',
})
const t = (id: string, over: Partial<Task>): Task => ({
  id, title: id, priority: 'normale', category: 'perso', status: 'a_faire', createdAt: '', updatedAt: '', ...over,
})

describe('revue de la semaine', () => {
  const src = {
    workouts: [w('2026-11-09'), w('2026-11-11', { program: [{ code: 'X1', week: 1 }, { code: 'Y1', week: 1 }] }), w('2026-11-20'), w('2026-11-10', { planned: true })],
    checkins: [c('2026-11-09', 60, 7), c('2026-11-10', 80, 8)],
    tasks: [
      t('a', { status: 'fait', completedAt: '2026-11-10T10:00:00Z' }),
      t('b', { due: '2026-11-12' }),
      t('c', { due: '2026-12-30' }),
    ],
  }
  it('calcule les chiffres de la semaine', () => {
    const s = weekStats('2026-11-09', src)
    expect(s.sessions).toBe(2)
    expect(s.minutes).toBe(90)
    expect(s.programSessions).toBe(2)
    expect(s.avgRecovery).toBe(70)
    expect(s.avgSleepH).toBe(7.5)
    expect(s.tasksDone).toBe(1)
    expect(s.tasksLate).toBe(1)
  })
  it('semaine vide : pas de moyenne inventée', () => {
    const s = weekStats('2026-10-05', src)
    expect(s.avgSleepH).toBeNull()
    expect(s.sessions).toBe(0)
  })
  it('la semaine à revoir : en cours le week-end, sinon la précédente', () => {
    expect(reviewWeekFor('2026-11-15')).toMatchObject({ start: '2026-11-09', current: true })
    expect(reviewWeekFor('2026-11-14')).toMatchObject({ start: '2026-11-09', current: true })
    expect(reviewWeekFor('2026-11-11')).toMatchObject({ start: '2026-11-02', current: false })
  })
  it('revue faite dès qu’un champ est rempli', () => {
    expect(reviewDone(undefined)).toBe(false)
    expect(reviewDone({ wentWell: '  ' })).toBe(false)
    expect(reviewDone({ answer: 'ok' })).toBe(true)
  })
  it('phrases : compare à la semaine d’avant, sans reproche', () => {
    const cur = weekStats('2026-11-09', src)
    const prev = { ...weekStats('2026-11-02', src), sessions: 4, avgSleepH: 6.5, avgRecovery: 60 }
    const lines = insights(cur, prev, 8)
    expect(lines.join(' ')).toContain('−2')
    expect(lines.some((l) => l.includes('Sommeil moyen 7 h 30'))).toBe(true)
    expect(insights({ ...cur, sessions: 0, minutes: 0 }, null, 8)[0]).toMatch(/repos/)
  })
  it('la question tient compte du contexte', () => {
    const cur = weekStats('2026-11-09', src)
    expect(questionFor('2026-11-09', { ...cur, sessions: 0 }, { ...cur, sessions: 3 }, 8)).toMatch(/entraînement/)
    expect(questionFor('2026-11-09', { ...cur, avgSleepH: 5.5 }, null, 8)).toMatch(/sommeil/)
    expect(questionFor('2026-11-09', cur, null, 8)).toBe(questionFor('2026-11-09', cur, null, 8))
  })
})
