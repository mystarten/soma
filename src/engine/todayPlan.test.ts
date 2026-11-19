import { describe, expect, it } from 'vitest'
import type { Program, ProgramSession } from '../types'
import { currentWeek, familyOf, programStartDay, recommend, sessionDetail, sessionWeekOn, weekLabel, weekPlan } from './todayPlan'
import { addDayKey } from './time'
import { makeWorkout } from '../test/fixtures'

const weeksFrom = (start: string, n = 12) => Array.from({ length: n }, (_, i) => ({ n: i + 1, label: '', startDay: addDayKey(start, 7 * i), endDay: addDayKey(start, 7 * i + 6), light: i === 4 || undefined, test: i === 11 || undefined }))
const block = (name: string, cell: string, rest = 90) => ({ name, restSec: rest, note: `repos 1:30 · consigne ${name}`, cells: Array.from({ length: 12 }, () => cell) })
const sess = (code: string, title: string, start: string, cell = '3 x 8', blocks = [block('A. Exo', cell)]): ProgramSession => ({ code, title, weeks: weeksFrom(start), blocks })
/* street : démarre le 12 oct. 2026 ; jambes et abdos : le 16 nov. 2026 (semaine 6 du programme) */
const program = (): Pick<Program, 'sessions'> => ({
  sessions: [
    sess('T1', 'Tirage lesté', '2026-10-12', '5 x 6 +25 kg'),
    sess('T2', 'Volume de tractions', '2026-10-12'),
    sess('P2', 'Pompes endurance', '2026-10-12', '4 x 20'),
    sess('J1', 'Force lente', '2026-11-16'),
    sess('A1', 'Gainage', '2026-11-16', '3 x 40 s'),
  ],
})
const noDone = new Map<string, Set<number>>()

describe('semaine du programme', () => {
  it('calcule la semaine d’après la date', () => {
    const p = program()
    expect(programStartDay(p)).toBe('2026-10-12')
    const w = currentWeek(p, '2026-11-19')!
    expect(w).toMatchObject({ n: 6, total: 12, start: '2026-11-16', end: '2026-11-22', label: '16-22 nov', state: 'during' })
    expect(currentWeek(p, '2026-10-12')!.n).toBe(1)
    expect(currentWeek(p, '2026-10-11')!.state).toBe('before')
    expect(currentWeek(p, '2027-03-01')!.state).toBe('after')
    expect(currentWeek(p, '2026-11-09')!.light).toBe(true) /* semaine 5 = décharge */
    expect(weekLabel('2026-11-30')).toBe('30 nov-6 déc')
  })
  it('la date de départ des réglages décale tout le programme', () => {
    const p = program()
    const w = currentWeek(p, '2026-11-19', '2026-10-19')!
    expect(w.n).toBe(5)
    expect(sessionWeekOn(p, p.sessions[3], '2026-11-19', '2026-10-19')).toBeNull() /* jambes : décalées d'une semaine, pas encore commencées */
  })
  it('jambes et abdos lisent leur propre semaine', () => {
    const p = program()
    const j1 = sessionWeekOn(p, p.sessions[3], '2026-11-19')!
    expect(j1.week.n).toBe(1)
    expect(sessionWeekOn(p, p.sessions[3], '2026-11-12')).toBeNull() /* avant le démarrage : jamais proposée */
  })
})

describe('détail et plan', () => {
  it('ne garde que les blocs qui ont quelque chose de prévu', () => {
    const s = sess('X', 'X', '2026-10-12', '3 x 8', [block('A. Plein', '3 x 8'), { ...block('B. Vide', ''), cells: Array.from({ length: 12 }, () => '') }, block('C. Repos', 'repos')])
    const d = sessionDetail(s, 0)
    expect(d.map((b) => b.name)).toEqual(['Plein'])
    expect(d[0]).toMatchObject({ restSec: 90, note: 'consigne A. Plein' })
  })
  it('une séance sans rien de prévu cette semaine n’est pas dans le plan', () => {
    const p = program()
    p.sessions[3].blocks[0].cells[0] = ''
    const w = currentWeek(p, '2026-11-19')!
    expect(weekPlan(p, w, noDone).map((x) => x.code)).not.toContain('J1')
    expect(weekPlan(p, w, noDone).map((x) => x.code)).toContain('A1')
  })
  it('classe les familles', () => {
    const p = program()
    expect(familyOf(p.sessions[0])).toBe('tirage')
    expect(familyOf(p.sessions[2])).toBe('poussee')
    expect(familyOf(p.sessions[3])).toBe('jambes')
    expect(familyOf(p.sessions[4])).toBe('abdos')
  })
})

describe('recommandation', () => {
  const base = () => {
    const p = program()
    return { program: p, done: noDone, week: currentWeek(p, '2026-11-19')!, nowMs: new Date('2026-11-19T10:00:00Z').getTime() }
  }
  it('ne propose jamais deux tirages à moins de 48 h', () => {
    const b = base()
    const pull = makeWorkout({ id: 'a', day: '2026-11-18', startedAt: '2026-11-18T08:00:00.000Z', program: [{ code: 'T1', week: 6 }] })
    const r = recommend({ ...b, workouts: [pull] })
    expect(r.pick?.family).not.toBe('tirage')
    expect(r.excluded.map((e) => e.code)).toEqual(expect.arrayContaining(['T2']))
    expect(r.excluded[0].why).toMatch(/48 h/)
  })
  it('autorise un tirage après 48 h', () => {
    const b = base()
    const pull = makeWorkout({ id: 'a', day: '2026-11-16', startedAt: '2026-11-16T08:00:00.000Z', program: [{ code: 'T1', week: 6 }] })
    const done = new Map([['T1', new Set([6])]])
    const r = recommend({ ...b, done, workouts: [pull] })
    expect(r.excluded).toEqual([])
    expect(r.remaining.map((x) => x.code)).not.toContain('T1')
  })
  it('limite à 3 séances de tirage par semaine', () => {
    const p = program()
    p.sessions.push(sess('T3', 'Tirage explosif', '2026-10-12'), sess('T4', 'Rameur', '2026-10-12'))
    const week = currentWeek(p, '2026-11-21')!
    const ws = ['T1', 'T2', 'T3'].map((c, i) => makeWorkout({ id: c, day: `2026-11-${16 + i}`, startedAt: `2026-11-${16 + i}T08:00:00.000Z`, program: [{ code: c, week: 6 }] }))
    const done = new Map([['T1', new Set([6])], ['T2', new Set([6])], ['T3', new Set([6])]])
    const r = recommend({ program: p, done, week, nowMs: new Date('2026-11-21T10:00:00Z').getTime(), workouts: ws })
    expect(r.excluded.find((e) => e.code === 'T4')?.why).toMatch(/maximum 3/)
    expect(r.pick?.family).not.toBe('tirage')
  })
  it('explique son choix et privilégie ce qui n’est pas fait cette semaine', () => {
    const b = base()
    const r = recommend({ ...b, workouts: [] })
    expect(r.pick).not.toBeNull()
    expect(r.reason).toMatch(/aucun .* cette semaine/)
  })
  it('résume ce qui est fait cette semaine', () => {
    const b = base()
    const w = makeWorkout({ id: 'a', day: '2026-11-17', startedAt: '2026-11-17T08:00:00.000Z', durationMin: 50, program: [{ code: 'P2', week: 6 }] })
    const r = recommend({ ...b, done: new Map([['P2', new Set([6])]]), workouts: [w] })
    expect(r.doneThisWeek).toHaveLength(1)
    expect(r.doneMinutes).toBe(50)
    expect(r.remaining.map((x) => x.code)).not.toContain('P2')
  })
})
