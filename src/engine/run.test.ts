import { describe, expect, it } from 'vitest'
import { parseCell } from './program'
import { hasIntervals, parseRunText, phasesMinutes, runPhases, shinAdvice } from './run'
import { socleOf } from './rotation'
import { categoryOf, buildExtraWorkout } from './calendar'
import { buildTrackingExport } from './exportJson'

describe('prescriptions de course', () => {
  it('« 5 x (3\' trot + 1\' marche) » donne 10 phases dans l’ordre', () => {
    const c = parseCell("5 x (3' trot + 1' marche)")
    expect(c.sets).toHaveLength(10)
    expect(c.sets.slice(0, 2).map((s) => [s.label, s.workSec])).toEqual([['Trot', 180], ['Marche', 60]])
    expect(c.text).toBe("5 x (3' trot + 1' marche)")
    const p = runPhases(c.sets)
    expect(hasIntervals(p)).toBe(true)
    expect(phasesMinutes(p)).toBe(20)
  })
  it('« 30\' continu » : une seule phase, pas de chrono d’intervalles', () => {
    const p = runPhases(parseCell("30' continu").sets)
    expect(p).toEqual([{ label: 'Continu', sec: 1800 }])
    expect(hasIntervals(p)).toBe(false)
  })
  it('accepte l’apostrophe typographique et les suites', () => {
    expect(parseRunText('4 x (4’ trot + 1’ marche)')).toHaveLength(8)
    expect(parseRunText("10' marche + 20' trot")?.map((s) => s.workSec)).toEqual([600, 1200])
  })
  it('ne confond pas avec les autres prescriptions', () => {
    expect(parseRunText('4 x 10 +20 kg')).toBeNull()
    expect(parseRunText('16 min 11 tractions / 20 pompes')).toBeNull()
  })
})

describe('course : type, conseil, export', () => {
  it('C1 est de la course', () => {
    expect(socleOf('C1')).toBe('course')
    expect(categoryOf({ kind: 'street', program: [{ code: 'C1', week: 7 }] })).toBe('course')
  })
  it('conseil seulement au-dessus de 3, jamais avant', () => {
    expect(shinAdvice(3)).toBeNull()
    expect(shinAdvice(0)).toBeNull()
    expect(shinAdvice(4)).toMatch(/vélo ou de la natation/)
  })
  it('la sortie garde effort et douleur, et part dans l’export', () => {
    const w = buildExtraWorkout({ day: '2026-11-20', type: 'course', name: '', distance: 4.5, durationMin: 30, rpe: 6, shinPainBefore: 1, shinPain: 2 }, 'r1', '2026-11-20T10:00:00Z')
    expect(w.rpe).toBe(6)
    expect(w.run?.shinPain).toBe(2)
    const out = buildTrackingExport({ program: null, workouts: [w], exercises: [] })
    expect(out.sessions[0]).toMatchObject({ type: expect.any(String), distance_m: 4500, duration_min: 30, rpe: 6, shin_pain_before: 1, shin_pain_after: 2 })
  })
})
