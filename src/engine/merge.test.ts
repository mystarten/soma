import { describe, expect, it } from 'vitest'
import { planFragments, planMerges } from './merge'
import { makeWorkout } from '../test/fixtures'

describe('fusion programme + montre', () => {
  it('fusionne T4 S1 et « gymnastics » du même jour', () => {
    const whoop = makeWorkout({ id: 'w1', day: '2026-11-14', startedAt: '2026-11-14T17:00:00.000Z', kind: 'street', source: 'whoop', title: 'Street workout', whoopStrain: 5 })
    const prog = makeWorkout({ id: 'p1', day: '2026-11-14', startedAt: '2026-11-14T16:30:00.000Z', kind: 'street', source: 'manual', title: 'T4 · S1', rpe: 8, program: [{ code: 'T4', week: 1 }] })
    const plans = planMerges([whoop, prog])
    expect(plans).toHaveLength(1)
    expect(plans[0].keep.id).toBe('w1')
    expect(plans[0].keep.title).toBe('T4 · S1')
    expect(plans[0].keep.whoopStrain).toBe(5)
    expect(plans[0].keep.program).toEqual([{ code: 'T4', week: 1 }])
    expect(plans[0].drop.id).toBe('p1')
  })
  it('ne touche pas deux jours différents ni les séances jambes', () => {
    const whoop = makeWorkout({ id: 'w1', day: '2026-11-14', kind: 'street', source: 'whoop' })
    const other = makeWorkout({ id: 'p1', day: '2026-11-13', kind: 'street', source: 'manual', program: [{ code: 'T4', week: 1 }] })
    const legs = makeWorkout({ id: 'p2', day: '2026-11-14', kind: 'muscu', source: 'manual', program: [{ code: 'J1', week: 1 }] })
    expect(planMerges([whoop, other, legs])).toHaveLength(0)
  })
  it('regroupe les activités de la montre découpées à moins d’une heure', () => {
    const a = makeWorkout({ id: 'a', day: '2026-11-14', startedAt: '2026-11-14T17:00:00.000Z', durationMin: 14, kind: 'street', source: 'whoop', whoopStrain: 4 })
    const b = makeWorkout({ id: 'b', day: '2026-11-14', startedAt: '2026-11-14T17:20:00.000Z', durationMin: 40, kind: 'street', source: 'whoop', whoopStrain: 9 })
    const c = makeWorkout({ id: 'c', day: '2026-11-14', startedAt: '2026-11-14T21:00:00.000Z', durationMin: 30, kind: 'street', source: 'whoop' })
    const plans = planFragments([a, b, c])
    expect(plans).toHaveLength(1)
    expect(plans[0].keep.durationMin).toBe(54)
    expect(plans[0].keep.whoopStrain).toBe(9)
    expect(plans[0].drop.map((w) => w.id)).toEqual(['b'])
  })
})
