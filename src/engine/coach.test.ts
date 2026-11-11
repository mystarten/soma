import { describe, expect, it } from 'vitest'
import type { CheckIn, Injury, SetEntry } from '../types'
import { applyLight, injuredZones, lightWeekAdvice, loadAlert, observed1RM, recommendedLoadKg, sessionImpact } from './coach'

const ci = (day: string, recovery?: number): CheckIn => ({ id: day, day, recovery, source: 'manual', updatedAt: '' })
const set = (id: string, block: string, over: Partial<SetEntry> = {}): SetEntry => ({ id, exerciseId: 'ex', block, reps: 5, ...over })
const inj = (area: Injury['area'], severity: Injury['severity'], active = true): Injury => ({ id: area, area, severity, since: '2026-11-01', active, updatedAt: '' })

describe('alerte de charge', () => {
  it('prévient au-delà de 1,3 puis 1,5, sans reproche', () => {
    expect(loadAlert({ acute7: 6, chronic28: 5, ratio: 1.2 })?.level).toBe('ok')
    expect(loadAlert({ acute7: 7, chronic28: 5, ratio: 1.4 })?.level).toBe('watch')
    const high = loadAlert({ acute7: 8, chronic28: 5, ratio: 1.6 })!
    expect(high.level).toBe('high')
    expect(high.text).toContain('+60 %')
  })
  it('signale une semaine plus légère et reste muet sans historique', () => {
    expect(loadAlert({ acute7: 2, chronic28: 5, ratio: 0.4 })?.level).toBe('low')
    expect(loadAlert({ acute7: 1, chronic28: 0.1, ratio: 0 })).toBeNull()
  })
})

describe('semaine légère automatique', () => {
  it('trois récupérations sous 50 % de suite', () => {
    const c = [ci('2026-11-09', 40), ci('2026-11-10', 35), ci('2026-11-11', 48)]
    expect(lightWeekAdvice(c, '2026-11-11')).toMatchObject({ active: true, days: 3 })
  })
  it('un bon jour au milieu annule', () => {
    expect(lightWeekAdvice([ci('2026-11-09', 40), ci('2026-11-10', 80), ci('2026-11-11', 40)], '2026-11-11').active).toBe(false)
  })
  it('le check-in du jour pas encore fait ne casse pas la série', () => {
    expect(lightWeekAdvice([ci('2026-11-08', 30), ci('2026-11-09', 40), ci('2026-11-10', 35)], '2026-11-11').active).toBe(true)
  })
  it('pas assez de jours : pas d’alerte', () => {
    expect(lightWeekAdvice([ci('2026-11-11', 20)], '2026-11-11').active).toBe(false)
  })
  it('retire un tiers des séries, même charge, au moins une série reste', () => {
    const sets = [...[1, 2, 3, 4, 5, 6].map((i) => set(`a${i}`, 'A')), set('b1', 'B'), set('c1', 'C'), set('c2', 'C')]
    const out = applyLight(sets)
    expect(out.filter((s) => s.block === 'A')).toHaveLength(4)
    expect(out.filter((s) => s.block === 'B')).toHaveLength(1)
    expect(out.filter((s) => s.block === 'C')).toHaveLength(1)
  })
})

describe('charges recommandées', () => {
  const pull = { id: 'ex', kind: 'bodyweight' as const, bodyweightFactor: 1 }
  it('1RM observé : le meilleur set récent, au poids du corps + lest', () => {
    const w = [{ sets: [set('1', 'A', { reps: 6, loadKg: 20 }), set('2', 'A', { reps: 30, loadKg: 50 })] }]
    expect(observed1RM(pull, w, 70)).toBeCloseTo(90 * (1 + 6 / 30), 1)
    expect(observed1RM({ ...pull, kind: 'static' as const }, w, 70)).toBe(0)
  })
  it('lest conseillé : retire le poids du corps et garde 2 reps en réserve', () => {
    const rm = 90 * 1.2 /* 108 */
    const load = recommendedLoadKg(pull, rm, 6, 70)!
    expect(load).toBeCloseTo(108 / (1 + 8 / 30) - 70, 0)
    expect(recommendedLoadKg(pull, 0, 6, 70)).toBeNull()
  })
})

describe('douleurs', () => {
  it('une articulation touche ses muscles ; guérie, elle ne compte plus', () => {
    const z = injuredZones([inj('genoux', 2), inj('epaules', 1, false)])
    expect(z.get('quadriceps')).toBe(2)
    expect(z.has('pectoraux')).toBe(false)
  })
  it('prévient les exercices qui sollicitent la zone', () => {
    const ex = [{ name: 'Squat bulgare', mix: { quadriceps: 1, fessiers: 0.6 } }, { name: 'Pompes', mix: { pectoraux: 1 } }]
    const w = sessionImpact(ex, [inj('genoux', 2)])
    expect(w).toHaveLength(1)
    expect(w[0].exercises).toEqual(['Squat bulgare'])
  })
})
