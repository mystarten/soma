import { describe, expect, it } from 'vitest'
import { groupByExercise, summarizeSets } from './sets'
import { restFactor } from './fatigue'
import { DEFAULT_FATIGUE_CONFIG } from './fatigueConfig'
import { EXERCISES, makeSet } from '../test/fixtures'

const ex = (id: string) => EXERCISES.find((e) => e.id === id)!

describe('résumé des séries', () => {
  it('3 séries de 8 tractions lestées de 10 kg', () => {
    const sets = [1, 2, 3].map(() => makeSet('ex_tractions_lestees', { reps: 8, loadKg: 10, restSec: 90 }))
    const s = summarizeSets(ex('ex_tractions_lestees'), sets)
    expect(s.totalReps).toBe(24)
    expect(s.line).toBe('3 × 8 = 24 reps · +10 kg · repos 1 min 30 s')
  })

  it('reps différentes : on les additionne', () => {
    const sets = [10, 8, 6].map((reps) => makeSet('ex_pompes', { reps }))
    const s = summarizeSets(ex('ex_pompes'), sets)
    expect(s.line).toBe('10 + 8 + 6 = 24 reps')
  })

  it('gainage : seulement le temps (et le repos), jamais de reps ni de kg', () => {
    const sets = [1, 2, 3].map(() => makeSet('ex_gainage', { holdSec: 60, restSec: 60, loadKg: 5 }))
    const s = summarizeSets(ex('ex_gainage'), sets)
    expect(s.totalHoldSec).toBe(180)
    expect(s.line).toBe('3 × 1 min = 3 min · repos 1 min')
    expect(s.line).not.toMatch(/reps|kg/)
  })

  it('une seule série et lest variable', () => {
    expect(summarizeSets(ex('ex_dips_lestes'), [makeSet('ex_dips_lestes', { reps: 5, loadKg: 20 })]).line).toBe('5 reps · +20 kg')
    const v = summarizeSets(ex('ex_dips_lestes'), [
      makeSet('ex_dips_lestes', { reps: 5, loadKg: 10 }),
      makeSet('ex_dips_lestes', { reps: 5, loadKg: 20 }),
    ])
    expect(v.line).toContain('10 → 20 kg')
  })

  it('regroupe par exercice dans l’ordre', () => {
    const g = groupByExercise([makeSet('a', {}), makeSet('b', {}), makeSet('a', {})])
    expect(g.map((x) => [x.exerciseId, x.sets.length])).toEqual([['a', 2], ['b', 1]])
  })
})

describe('effet du repos sur l’intensité', () => {
  const c = DEFAULT_FATIGUE_CONFIG
  it('repos court = plus intense, repos long = plus facile, borné', () => {
    expect(restFactor(90, c)).toBe(1)
    expect(restFactor(30, c)).toBeGreaterThan(1)
    expect(restFactor(180, c)).toBeLessThan(1)
    expect(restFactor(0, c)).toBe(1)
    expect(restFactor(undefined, c)).toBe(1)
    expect(restFactor(5, c)).toBeLessThanOrEqual(c.restFactorMax)
    expect(restFactor(900, c)).toBeGreaterThanOrEqual(c.restFactorMin)
  })
})
