import { describe, expect, it } from 'vitest'
import { alignmentScore, evaluateGoal, goalPeriod, weeklySentence } from './goals'
import type { Goal } from '../types'
import { EXERCISES, makeCheckIn, makeSet, makeWorkout } from '../test/fixtures'
import { lastDays } from './time'

const base: Omit<Goal, 'id' | 'kind' | 'target' | 'direction'> = {
  name: 'Objectif',
  period: 'week',
  weight: 1,
  active: true,
  updatedAt: '2025-01-01T00:00:00.000Z',
}

const goal = (over: Partial<Goal> & Pick<Goal, 'kind' | 'target' | 'direction'>): Goal => ({
  id: `g_${over.kind}`,
  ...base,
  ...over,
})

function ctx(over: Partial<Parameters<typeof evaluateGoal>[3]> = {}) {
  return {
    workouts: [],
    checkins: [],
    exercises: EXERCISES,
    customMetrics: [],
    bodyWeightKg: 70,
    sleepGoalHours: 8,
    weekStartsOn: 1 as const,
    ...over,
  }
}

describe('objectifs', () => {
  it('compte les séances de la semaine et classe le statut sans drame', () => {
    const workouts = ['2025-06-23', '2025-06-25', '2025-06-27'].map((day) =>
      makeWorkout({ day, startedAt: `${day}T18:00:00.000Z` }),
    )
    const p = evaluateGoal(
      goal({ kind: 'sessions_count', target: 4, direction: 'min' }),
      '2025-06-23',
      '2025-06-29',
      ctx({ workouts }),
    )
    expect(p.actual).toBe(3)
    expect(p.ratio).toBeCloseTo(0.75)
    expect(p.status).toBe('mid')
  })

  it('un objectif tenu à 80 % passe en « tenu »', () => {
    const workouts = ['2025-06-23', '2025-06-24', '2025-06-25', '2025-06-27'].map((day) =>
      makeWorkout({ day, startedAt: `${day}T18:00:00.000Z` }),
    )
    const p = evaluateGoal(
      goal({ kind: 'sessions_count', target: 5, direction: 'min' }),
      '2025-06-23',
      '2025-06-29',
      ctx({ workouts }),
    )
    expect(p.status).toBe('ok')
  })

  it('les objectifs « rester sous » s’évaluent à l’envers', () => {
    const checkins = [makeCheckIn('2025-06-25', { restingHr: 52 })]
    const p = evaluateGoal(
      goal({ kind: 'resting_hr', target: 50, direction: 'max' }),
      '2025-06-23',
      '2025-06-29',
      ctx({ checkins }),
    )
    expect(p.actual).toBe(52)
    expect(p.ratio).toBeCloseTo(50 / 52, 3)
    expect(p.status).toBe('ok')
  })

  it('compare le plan hebdo prévu et réel', () => {
    const plan = [
      { weekday: 1, kind: 'street' as const, label: 'Pull' },
      { weekday: 3, kind: 'course' as const },
      { weekday: 5, kind: 'street' as const, label: 'Push' },
      { weekday: 0, kind: 'repos' as const },
    ]
    const workouts = [
      makeWorkout({ day: '2025-06-23', startedAt: '2025-06-23T18:00:00.000Z', kind: 'street' }),
      makeWorkout({ day: '2025-06-25', startedAt: '2025-06-25T18:00:00.000Z', kind: 'course' }),
    ]
    const p = evaluateGoal(
      goal({ kind: 'weekly_plan', target: 3, direction: 'min', plan }),
      '2025-06-23',
      '2025-06-29',
      ctx({ workouts }),
    )
    expect(p.actual).toBe(2)
    expect(p.series).toHaveLength(3)
    expect(p.series!.filter((s) => s.actual === 1)).toHaveLength(2)
  })

  it('mesure un record visé sur tout l’historique', () => {
    const workouts = [
      makeWorkout({
        day: '2025-01-05',
        startedAt: '2025-01-05T18:00:00.000Z',
        sets: [makeSet('ex_tractions_pronation', { reps: 34 })],
      }),
    ]
    const p = evaluateGoal(
      goal({ kind: 'performance', target: 40, direction: 'min', exerciseId: 'ex_tractions_pronation' }),
      '2025-06-23',
      '2025-06-29',
      ctx({ workouts }),
    )
    expect(p.actual).toBe(34)
    expect(p.ratio).toBeCloseTo(0.85)
    expect(p.status).toBe('ok')
  })

  it('renvoie « pas de données » plutôt qu’un zéro trompeur', () => {
    const p = evaluateGoal(
      goal({ kind: 'sleep_hours', target: 8, direction: 'min' }),
      '2025-06-23',
      '2025-06-29',
      ctx(),
    )
    expect(p.status).toBe('empty')
  })

  it('compte les nuits au-dessus d’un seuil', () => {
    const checkins = [7.2, 8.1, 6.4, 8.6].map((h, i) =>
      makeCheckIn(`2025-06-2${3 + i}`, { sleep: { hours: h } }),
    )
    const p = evaluateGoal(
      goal({ kind: 'sleep_nights_above', target: 5, direction: 'min', threshold: 7.5 }),
      '2025-06-23',
      '2025-06-29',
      ctx({ checkins }),
    )
    expect(p.actual).toBe(2)
    expect(p.detail).toContain('7.5')
  })

  it('le score Alignement moyenne les objectifs actifs sur 4 semaines', () => {
    const days = lastDays('2025-06-29', 28)
    const workouts = days
      .filter((_, i) => i % 2 === 0)
      .map((day) => makeWorkout({ day, startedAt: `${day}T18:00:00.000Z` }))
    const goals = [
      goal({ kind: 'sessions_count', target: 3, direction: 'min', weight: 2 }),
      goal({ id: 'g2', kind: 'sessions_count', target: 10, direction: 'min', weight: 1 }),
    ]
    const score = alignmentScore(goals, ctx({ workouts }), '2025-06-29')
    expect(score).toBeGreaterThan(50)
    expect(score).toBeLessThanOrEqual(100)
    expect(alignmentScore([], ctx(), '2025-06-29')).toBe(0)
  })

  it('calcule les bornes de période', () => {
    const w = goalPeriod(goal({ kind: 'sessions_count', target: 3, direction: 'min' }), '2025-06-25', 1)
    expect(w.from).toBe('2025-06-23')
    expect(w.to).toBe('2025-06-29')
    const m = goalPeriod(
      goal({ kind: 'sessions_count', target: 12, direction: 'min', period: 'month' }),
      '2025-06-25',
      1,
    )
    expect(m.from).toBe('2025-06-01')
    expect(m.to).toBe('2025-06-30')
  })

  it('la phrase de bilan reste encourageante', () => {
    const p = evaluateGoal(
      goal({ kind: 'sessions_count', target: 4, direction: 'min' }),
      '2025-06-23',
      '2025-06-29',
      ctx({ workouts: [makeWorkout({ day: '2025-06-24', startedAt: '2025-06-24T18:00:00.000Z' })] }),
    )
    const s = weeklySentence([p], 35)
    expect(s).not.toMatch(/raté|échec|mauvais/i)
    expect(weeklySentence([], 0)).toMatch(/données/)
  })
})
