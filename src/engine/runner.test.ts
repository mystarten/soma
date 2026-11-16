import { describe, expect, it } from 'vitest'
import { describeTarget, fmtClock, remainingSec, restAfter, setPosition } from './runner'

describe('séance guidée', () => {
  it('décrit la cible', () => {
    expect(describeTarget({ reps: 8, loadKg: 20 })).toBe('8 reps · +20 kg')
    expect(describeTarget({ holdSec: 40 })).toBe('Tenue 40 s')
    expect(describeTarget({ reps: 1 })).toBe('1 rep')
    expect(describeTarget({})).toBe('Libre')
  })
  it('donne le repos après chaque série, aucun après la dernière', () => {
    const sets = [{ restSec: 120 }, { restSec: undefined }, { restSec: 60 }]
    expect(restAfter(sets, 0)).toBe(120)
    expect(restAfter(sets, 1)).toBe(90)
    expect(restAfter(sets, 2)).toBe(0)
  })
  it('chronomètre depuis un instant absolu', () => {
    expect(remainingSec(10_000, 4_000)).toBe(6)
    expect(remainingSec(10_000, 20_000)).toBe(0)
    expect(fmtClock(125)).toBe('2:05')
    expect(fmtClock(0.2)).toBe('0:01')
  })
  it('numérote les séries dans leur bloc', () => {
    const sets = [{ block: 'a' }, { block: 'a' }, { block: 'b' }, { block: 'a' }]
    expect(setPosition(sets, 3)).toEqual({ n: 3, of: 3 })
    expect(setPosition(sets, 2)).toEqual({ n: 1, of: 1 })
  })
})
