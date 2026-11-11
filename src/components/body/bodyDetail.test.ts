import { describe, expect, it } from 'vitest'
import { MUSCLE_ZONES, JOINTS } from '../../types'
import { BONE_DETAIL, MUSCLE_DETAIL } from './bodyDetail'
import { JOINT_PARTS, ZONES } from './bodyParts'

describe('anatomie : rien ne manque', () => {
  it('chaque zone musculaire existe en forme d’ensemble et en détail (chefs, faisceaux)', () => {
    for (const z of MUSCLE_ZONES) {
      expect(ZONES.some((p) => p.zone === z), `forme d’ensemble : ${z}`).toBe(true)
      expect(MUSCLE_DETAIL.some((p) => p.zone === z), `détail : ${z}`).toBe(true)
    }
  })
  it('chaque articulation a sa forme et ses os', () => {
    for (const j of JOINTS) {
      expect(JOINT_PARTS.some((p) => p.joint === j), j).toBe(true)
      expect(BONE_DETAIL.some((p) => p.joint === j), j).toBe(true)
    }
  })
  it('les chefs musculaires multiples sont là', () => {
    const count = (z: string) => MUSCLE_DETAIL.filter((p) => p.zone === z).length
    expect(count('biceps')).toBeGreaterThanOrEqual(2)
    expect(count('triceps')).toBeGreaterThanOrEqual(3)
    expect(count('quadriceps')).toBeGreaterThanOrEqual(4)
    expect(count('ischios')).toBeGreaterThanOrEqual(3)
    expect(count('abdos')).toBeGreaterThanOrEqual(8 / 2)
  })
})
