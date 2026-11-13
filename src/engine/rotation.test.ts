import { describe, expect, it } from 'vitest'
import type { ProgramSession } from '../types'
import { MARK_START, backfillMarks, computeRotation, lastDoneBySession, removeRef, socleOf } from './rotation'
import { programDone } from './program'

const weeks = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i + 1, label: `S${i + 1}` }))
const sess = (code: string, n = 12): ProgramSession => ({ code, title: `Séance ${code}`, weeks: weeks(n), blocks: [] })
const program = { sessions: ['T1', 'T2', 'M1', 'J1', 'J2', 'A1', 'A2', 'A3'].map((c) => sess(c)) }
const done = (o: Record<string, number>) => new Map(Object.entries(o).map(([c, n]) => [c, new Set(Array.from({ length: n }, (_, i) => i + 1))]))
const avail = (r: ReturnType<typeof computeRotation>, socle: string) => r.find((x) => x.socle === socle)!.available.map((i) => i.code)

describe('socles', () => {
  it('rangent les séances d’après leur lettre', () => {
    expect(['T1', 'T4', 'M1', 'P2'].map(socleOf)).toEqual(['street', 'street', 'street', 'street'])
    expect(socleOf('J2')).toBe('jambes')
    expect(socleOf('A3')).toBe('abdos')
  })
})

describe('roulement', () => {
  it('au départ, tout le socle est disponible en semaine 1', () => {
    const r = computeRotation(program, new Map(), new Map())
    expect(avail(r, 'street')).toEqual(['T1', 'T2', 'M1'])
    expect(avail(r, 'abdos')).toEqual(['A1', 'A2', 'A3'])
    expect(r[0].available[0].nextWeek).toBe(1)
  })
  it('on ne revient pas sur une séance avant d’avoir fait les autres du socle', () => {
    const r = computeRotation(program, done({ T1: 8, T2: 7, M1: 7 }), new Map())
    expect(avail(r, 'street')).toEqual(['T2', 'M1'])
    expect(r.find((x) => x.socle === 'street')!.waiting.map((i) => i.code)).toEqual(['T1'])
  })
  it('abdos et jambes : une séance à la fois tant que les autres du socle ne sont pas faites', () => {
    const r = computeRotation(program, done({ J1: 1, A1: 1 }), new Map())
    expect(avail(r, 'jambes')).toEqual(['J2'])
    expect(avail(r, 'abdos')).toEqual(['A2', 'A3'])
  })
  it('les socles sont indépendants : faire du street ne touche ni les abdos ni les jambes', () => {
    const r = computeRotation(program, done({ T1: 3, T2: 3, M1: 3 }), new Map())
    expect(avail(r, 'abdos')).toEqual(['A1', 'A2', 'A3'])
    expect(avail(r, 'jambes')).toEqual(['J1', 'J2'])
  })
  it('début de tour : jamais la séance qu’on vient de faire', () => {
    const last = new Map([['T2', '2026-11-12T18:00:00.000Z'], ['T1', '2026-11-10T18:00:00.000Z']])
    const r = computeRotation(program, done({ T1: 7, T2: 7, M1: 7 }), last)
    expect(avail(r, 'street')).toEqual(['T1', 'M1'])
  })
  it('sans date de vraie séance (simples coches), personne n’est écarté', () => {
    expect(avail(computeRotation(program, done({ T1: 7, T2: 7, M1: 7 }), new Map()), 'street')).toEqual(['T1', 'T2', 'M1'])
  })
  it('une séance terminée sort du roulement', () => {
    const r = computeRotation(program, done({ J1: 12, J2: 5 }), new Map())
    expect(avail(r, 'jambes')).toEqual(['J2'])
    expect(r.find((x) => x.socle === 'jambes')!.finished.map((i) => i.code)).toEqual(['J1'])
  })
  it('la semaine suivante est la première non faite, même si on a sauté une coche', () => {
    const d = new Map([['T1', new Set([1, 2, 4])]])
    expect(computeRotation({ sessions: [sess('T1')] }, d, new Map())[0].items[0].nextWeek).toBe(3)
  })
})

describe('rattrapage et annulation', () => {
  const marks = backfillMarks(program, { street: 7, jambes: 0, abdos: 0 }, (() => { let n = 0; return () => `m${n++}` })(), '2026-11-13T00:00:00Z')
  it('crée une coche par semaine faite, uniquement pour les socles renseignés', () => {
    expect(marks).toHaveLength(3 * 7)
    expect(marks.every((m) => m.backfill && m.startedAt === MARK_START && m.durationMin === 0)).toBe(true)
    expect(marks.some((m) => m.program?.[0].code === 'A1')).toBe(false)
  })
  it('les coches comptent comme faites, mais pas comme dernière séance', () => {
    const d = programDone(marks)
    expect(d.get('T1')?.size).toBe(7)
    expect(lastDoneBySession(marks).size).toBe(0)
    const r = computeRotation(program, d, lastDoneBySession(marks))
    expect(avail(r, 'street')).toEqual(['T1', 'T2', 'M1'])
    expect(r[0].available[0].nextWeek).toBe(8)
  })
  it('retirer une coche : supprime l’enregistrement ou n’enlève que cette référence', () => {
    expect(removeRef({ program: [{ code: 'T1', week: 8 }] }, 'T1', 8)).toEqual({ action: 'delete' })
    expect(removeRef({ program: [{ code: 'T1', week: 8 }, { code: 'A1', week: 1 }] }, 'T1', 8)).toEqual({ action: 'update', program: [{ code: 'A1', week: 1 }] })
    expect(removeRef({ program: [{ code: 'T1', week: 8 }] }, 'T2', 8)).toEqual({ action: 'none' })
  })
})
