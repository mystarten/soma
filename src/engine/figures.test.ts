import { describe, expect, it } from 'vitest'
import { FIGURES, figureFor, posePaths, type Pt } from './figures'

const inBox = (p: Pt) => p[0] >= 0 && p[0] <= 120 && p[1] >= 0 && p[1] <= 90

describe('bonshommes des exercices', () => {
  it('chaque dessin tient dans le cadre et ses positions sont compatibles entre elles', () => {
    for (const f of FIGURES) {
      expect(f.frames.length).toBeGreaterThanOrEqual(2)
      const base = posePaths(f.frames[0]).limbs.length
      for (const fr of f.frames) {
        expect(posePaths(fr).limbs.length).toBe(base)
        for (const pt of [fr.h, fr.s, fr.e, fr.w, fr.p, fr.k, fr.f, ...(fr.t ? [fr.t] : []), ...(fr.x ?? []).flat()]) expect(inBox(pt)).toBe(true)
      }
      expect(f.tip.length).toBeGreaterThan(20)
    }
  })
  it('trouve le bon dessin par nom ou par identifiant', () => {
    expect(figureFor(undefined, 'Planche latérale')?.id).toBe('gainage-lateral')
    expect(figureFor('ex_tractions_lestees', 'A. Lestées +25 kg')?.id).toBe('traction')
    expect(figureFor(undefined, 'Muscle-ups')?.id).toBe('muscle-up')
    expect(figureFor(undefined, 'Pompes diamant')?.id).toBe('pompes')
    expect(figureFor('ex_dips', 'C. Dips poids du corps')?.id).toBe('dips')
    expect(figureFor(undefined, 'Copenhagen')?.id).toBe('copenhagen')
    expect(figureFor(undefined, 'Exercice inconnu')).toBeNull()
  })
})
