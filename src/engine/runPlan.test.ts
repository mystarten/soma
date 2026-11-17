import { describe, expect, it } from 'vitest'
import { fmtDuration, planTiming } from './runPlan'
import { parseCell } from './program'

describe('durée d’une séance', () => {
  it('additionne exactement repos, tenues et durées connues, et estime les répétitions', () => {
    const sets = [
      { holdSec: 30, restSec: 60 },
      { holdSec: 30, restSec: 60 },
      { reps: 10, restSec: 90 },
      { workSec: 600, restSec: 120 },
    ]
    const t = planTiming(sets)
    expect(t.restSec).toBe(60 + 60 + 90) /* aucun repos après la dernière série */
    expect(t.timedSec).toBe(30 + 30 + 600)
    expect(t.repsSec).toBe(10 * 3 + 5)
    expect(t.totalSec).toBe(t.restSec + t.timedSec + t.repsSec)
  })
  it('affiche la durée lisiblement', () => {
    expect(fmtDuration(2520)).toBe('42 min')
    expect(fmtDuration(4080)).toBe('1 h 08')
  })
  it('lit la durée des EMOM et du rameur dans le programme', () => {
    expect(parseCell('EMOM 10 min  8 / min').sets[0].workSec).toBe(600)
    expect(parseCell('330 m  1:48', { tours: 2 }).sets[0].workSec).toBe(Math.round((330 / 500) * 108))
  })
})
