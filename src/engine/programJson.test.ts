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

import { explainJsonSyntaxError } from './programJson'
import { isPlannedWeek, plannedWeeks, programStats } from './program'
import { currentWeek, weekPlan } from './todayPlan'

describe('semaines à null et erreurs précises', () => {
  const doc = () => ({
    format: 'soma-programme',
    weeks: [{ n: 1, label: 'S1', start: '2026-11-16' }, { n: 2, label: 'S2', start: '2026-11-23' }, { n: 3, label: 'S3', start: '2026-11-30' }],
    sessions: [
      { code: 'J1', title: 'Jambes', blocks: [{ name: 'Squat', rest_sec: 90, weeks: [null, '3 x 10', { sets: 3, reps: 12 }] }] },
      { code: 'A1', title: 'Abdos', blocks: [{ name: 'Planche', weeks: [null, null, null] }] },
    ],
  })
  it('une semaine à null n’existe pas : ni case, ni bloc, ni séance proposée', () => {
    const r = programFromJson(doc())
    expect(r.errors).toEqual([])
    const j1 = r.program!.sessions[0]
    expect(plannedWeeks(j1).map((w) => w.n)).toEqual([2, 3])
    expect(isPlannedWeek(j1, j1.weeks[0])).toBe(false)
    expect(r.warnings.join(' ')).toMatch(/A1 : aucune semaine n’a de contenu/)
    const p = r.program!
    const w1 = currentWeek(p, '2026-11-17')! /* semaine 1 : tout est null */
    expect(weekPlan(p, w1, new Map())).toEqual([])
    expect(weekPlan(p, currentWeek(p, '2026-11-24')!, new Map()).map((x) => x.code)).toEqual(['J1'])
    expect(programStats(p, [], '2026-11-24').total).toBe(2) /* 2 semaines prévues, pas 6 */
  })
  it('donne la séance, le bloc, la semaine et le champ en cas d’erreur', () => {
    const d = doc()
    d.sessions[0].blocks[0].weeks[2] = { emom: { minutes: 'abc' } } as never
    const r = programFromJson(d)
    expect(r.errors[0]).toBe('J1 › Squat › semaine 3 : emom.minutes doit être un nombre de minutes (ex. 18).')
    const e = doc()
    ;(e.sessions[0] as Record<string, unknown>).code = '1x'
    expect(programFromJson(e).errors[0]).toMatch(/Séance n°1 : le champ « code » est invalide/)
    const f = doc()
    f.sessions[0].blocks[0].weeks[1] = { series: [{ reps: 8 }, { note: 'x' }] } as never
    expect(programFromJson(f).errors[0]).toMatch(/J1 › Squat › semaine 2 : champ « series\[2\] »/)
  })
  it('localise une faute de syntaxe JSON', () => {
    const text = '{\n  "a": 1,\n  "b": ,\n}'
    let msg = ''
    try {
      JSON.parse(text)
    } catch (e) {
      msg = explainJsonSyntaxError(text, e)
    }
    expect(msg).toMatch(/ligne 3/)
  })
})
