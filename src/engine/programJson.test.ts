import { describe, expect, it } from 'vitest'
import { PROGRAM_FORMAT_DOC, programFromJson, programToJson } from './programJson'
import { buildFromProgram } from './program'

const sample = () => {
  const m = /EXEMPLE\n([\s\S]*)$/.exec(PROGRAM_FORMAT_DOC)!
  return JSON.parse(m[1])
}

describe('programme JSON', () => {
  it('l’exemple donné à l’IA est valide et produit les bonnes séries', () => {
    const r = programFromJson(sample())
    expect(r.errors).toEqual([])
    const program = r.program!
    const w1 = buildFromProgram(program, [{ code: 'M1', week: 1 }], () => 'id')!
    /* pyramide : traction puis pompes enchaînées, repos après chaque paire */
    const py = w1.sets.filter((s) => s.label === 'Tractions' || s.label === 'Pompes').slice(0, 4)
    expect(py.map((s) => `${s.label}:${s.reps}:${s.restSec}`)).toEqual(['Tractions:5:0', 'Pompes:10:90', 'Tractions:10:0', 'Pompes:20:90'])
    /* EMOM : une seule série, 12 min, deux exercices en alternance */
    const emom = w1.sets.find((s) => s.emom)!
    expect(emom.emom!.minutes).toBe(12)
    expect(emom.emom!.items.map((i) => i.reps)).toEqual([9, 18])
    expect(emom.workSec).toBe(720)
    /* tenue */
    expect(w1.sets.filter((s) => s.holdSec === 30)).toHaveLength(3)
  })
  it('signale les erreurs avec l’endroit exact', () => {
    const r = programFromJson({ sessions: [{ code: 'T1', blocks: [{ name: 'X', weeks: [{ sets: 3 }] }] }] })
    expect(r.errors[0]).toMatch(/T1 › X › semaine 1/)
    expect(programFromJson({ sessions: [] }).errors.length).toBeGreaterThan(0)
    expect(programFromJson('nope').errors.length).toBeGreaterThan(0)
  })
  it('un aller-retour export puis import ne change rien', () => {
    const p = programFromJson(sample()).program!
    const again = programFromJson(programToJson(p))
    expect(again.errors).toEqual([])
    expect(again.program!.sessions[0].blocks[0].plans?.[0]).toEqual(p.sessions[0].blocks[0].plans?.[0])
  })
})
