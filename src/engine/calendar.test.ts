import { describe, expect, it } from 'vitest'
import { buildExtraWorkout, categoryOf, monthGrid, workoutsByDay } from './calendar'
import { makeWorkout } from '../test/fixtures'

describe('calendrier', () => {
  it('classe les séances du programme et les autres', () => {
    expect(categoryOf({ kind: 'street', program: [{ code: 'T1', week: 1 }] })).toBe('street')
    expect(categoryOf({ kind: 'muscu', program: [{ code: 'J2', week: 1 }] })).toBe('jambes')
    expect(categoryOf({ kind: 'abdos', program: [{ code: 'A1', week: 1 }] })).toBe('abdos')
    expect(categoryOf({ kind: 'course' })).toBe('course')
    expect(categoryOf({ kind: 'cardio', cardio: { modality: 'natation' } })).toBe('natation')
    expect(categoryOf({ kind: 'custom' })).toBe('autre')
  })
  it('range les séances par jour sans les coches de rattrapage', () => {
    const a = makeWorkout({ id: 'a', day: '2026-03-18', startedAt: '2026-03-18T10:00:00.000Z' })
    const b = makeWorkout({ id: 'b', day: '2026-03-18', startedAt: '2026-03-18T08:00:00.000Z' })
    const m = makeWorkout({ id: 'm', day: '2026-03-18', backfill: true })
    const map = workoutsByDay([a, b, m])
    expect(map.get('2026-03-18')?.map((w) => w.id)).toEqual(['b', 'a'])
  })
  it('construit un mois de 6 semaines commençant le lundi', () => {
    const g = monthGrid(2026, 2, 1) /* mars 2026 : le 1er est un dimanche */
    expect(g).toHaveLength(42)
    expect(g[0].day).toBe('2026-02-23')
    expect(g.filter((c) => c.inMonth)).toHaveLength(31)
  })
  it('crée une course en km et une natation en mètres', () => {
    const run = buildExtraWorkout({ day: '2026-03-18', type: 'course', name: 'Footing', distance: 8.5, durationMin: 45 }, 'r', 'n')
    expect(run.kind).toBe('course')
    expect(run.run?.distanceM).toBe(8500)
    const swim = buildExtraWorkout({ day: '2026-03-18', type: 'natation', name: '', distance: 1500, durationMin: 40 }, 's', 'n')
    expect(swim.cardio).toEqual({ modality: 'natation', distanceM: 1500 })
    expect(swim.title).toBe('Natation')
  })
})
