import { describe, expect, it } from 'vitest'
import { alignmentScore, countsForSocle, distinctSessions, evaluateGoal, goalPeriod, goalScore, weeklySentence } from './goals'
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

  it('compte les séances par famille (programme ou type de séance)', () => {
    const street = makeWorkout({ day: '2025-06-23', startedAt: '2025-06-23T18:00:00.000Z', kind: 'street' })
    const legs = makeWorkout({ day: '2025-06-24', startedAt: '2025-06-24T18:00:00.000Z', kind: 'muscu', program: [{ code: 'J1', week: 1 }] })
    expect(countsForSocle(street, 'street')).toBe(true)
    expect(countsForSocle(legs, 'jambes')).toBe(true)
    expect(countsForSocle(legs, 'street')).toBe(false)
    const p = evaluateGoal(goal({ kind: 'sessions_socle', socle: 'jambes', target: 2, direction: 'min' }), '2025-06-23', '2025-06-29', ctx({ workouts: [street, legs] }))
    expect(p.actual).toBe(1)
    expect(p.ratio).toBeCloseTo(0.5)
  })

  it('un record visé tient compte des records saisis à la main', () => {
    const g = goal({ kind: 'performance', exerciseId: 'ex_pullup', target: 40, direction: 'min' })
    const exId = EXERCISES[0].id
    const p = evaluateGoal({ ...g, exerciseId: exId }, '2025-06-01', '2025-06-30', ctx({ references: [{ exerciseId: exId, reps: 34 }] }))
    expect(p.actual).toBe(34)
    const fiveK = evaluateGoal(goal({ kind: 'performance', exerciseId: 'run_5k', target: 20, direction: 'max' }), '2025-06-01', '2025-06-30', ctx({ references: [{ exerciseId: 'run_5k', holdSec: 1260 }] }))
    expect(fiveK.actual).toBeCloseTo(21)
    expect(fiveK.ratio).toBeLessThan(1)
  })

  it('le score ignore la semaine en cours quand des semaines sont terminées', () => {
    const g = goal({ kind: 'sessions_count', target: 2, direction: 'min' })
    const workouts = ['2025-06-16', '2025-06-17', '2025-06-09', '2025-06-10'].map((day) => makeWorkout({ day, startedAt: `${day}T18:00:00.000Z` }))
    const r = goalScore(g, ctx({ workouts }), '2025-06-25')
    expect(r).not.toBeNull()
    expect(r!).toBeGreaterThan(0.4)
    expect(goalScore(g, ctx(), '2025-06-25')).toBe(0)
  })

  it('deux enregistrements qui se touchent ne font qu’une séance', () => {
    const a = makeWorkout({ id: 'a', day: '2025-06-24', startedAt: '2025-06-24T17:00:00.000Z', durationMin: 30, kind: 'street' })
    const b = makeWorkout({ id: 'b', day: '2025-06-24', startedAt: '2025-06-24T17:45:00.000Z', durationMin: 20, kind: 'street' })
    const c = makeWorkout({ id: 'c', day: '2025-06-24', startedAt: '2025-06-24T21:00:00.000Z', durationMin: 40, kind: 'street' })
    expect(distinctSessions([a, b, c])).toHaveLength(2)
    const p = evaluateGoal(goal({ kind: 'sessions_socle', socle: 'street', target: 5, direction: 'min' }), '2025-06-23', '2025-06-29', ctx({ workouts: [a, b, c] }))
    expect(p.actual).toBe(2)
    expect(p.matched).toHaveLength(2)
  })
})
