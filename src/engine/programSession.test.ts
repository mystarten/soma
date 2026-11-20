import { describe, expect, it } from 'vitest'
import type { Program, ProgramSession, Workout } from '../types'
import { programDone, programPlanned } from './program'
import { applyLinkChange, defaultWeek, draftSession, findDuplicate, linkCleanup, sessionChoices, workoutFromSession } from './programSession'
import { addDayKey } from './time'

const START = '2026-10-12'
const weeks = (from = START) =>
  Array.from({ length: 12 }, (_, i) => ({ n: i + 1, label: `S${i + 1}`, startDay: addDayKey(from, 7 * i), endDay: addDayKey(from, 7 * i + 6), light: i === 4 || i === 9, test: i === 11 }))
/** `nullUntil` = nombre de premières semaines sans contenu (null). */
const sess = (code: string, nullUntil = 0): ProgramSession => ({
  code,
  title: `Séance ${code}`,
  durationMin: 40,
  weeks: weeks(),
  blocks: [{ name: 'Tractions', exercise: 'Tractions', restSec: 90, cells: Array.from({ length: 12 }, (_, i) => (i < nullUntil ? '' : '3 x 5')) }],
})
const program: Pick<Program, 'sessions'> = { sessions: [sess('T1'), sess('A2', 5)] }
let n = 0
const mk = () => `s${n++}`
const w = (id: string, day: string, code: string, week: number, extra: Partial<Workout> = {}): Workout => ({
  id, day, startedAt: `${day}T10:00:00.000Z`, durationMin: 30, kind: 'street', title: `${code} · S${week}`, program: [{ code, week }], source: 'manual', updatedAt: '2026-11-19T00:00:00Z', ...extra,
})

describe('semaine par défaut', () => {
  it('prend la semaine du programme qui contient le jour', () => {
    expect(defaultWeek(program, program.sessions[0], '2026-11-17')).toBe(6)
    expect(defaultWeek(program, program.sessions[0], '2026-10-12')).toBe(1)
  })
  it('avant le début ou sur une semaine sans rien de prévu : la plus proche avec du contenu', () => {
    expect(defaultWeek(program, program.sessions[1], '2026-10-20')).toBe(6)
    expect(defaultWeek(program, program.sessions[0], '2026-09-01')).toBe(1)
    expect(defaultWeek(program, program.sessions[0], '2027-03-01')).toBe(12)
  })
  it('les séances sans aucun contenu ne sont pas proposées', () => {
    expect(sessionChoices({ sessions: [sess('T1'), sess('X', 12)] }).map((s) => s.code)).toEqual(['T1'])
  })
})

describe('enregistrer une séance du programme', () => {
  const draft = draftSession(program, 'T1', 6, mk)!
  const base = { id: 'w1', draft, time: '18:00', durationMin: 42, rpe: 8, note: 'Bien', sets: draft.sets, today: '2026-11-19', now: '2026-11-19T10:00:00Z' }
  it('préremplit les séries de la semaine', () => {
    expect(draft.sets).toHaveLength(3)
    expect(draft.sets[0].reps).toBe(5)
    expect(draft.program).toEqual([{ code: 'T1', week: 6 }])
  })
  it('jour passé : séance faite, avec le lien programme', () => {
    const r = workoutFromSession({ ...base, day: '2026-11-17' })
    expect(r.planned).toBeUndefined()
    expect(r.program).toEqual([{ code: 'T1', week: 6 }])
    expect(r.rpe).toBe(8)
    expect(r.durationMin).toBe(42)
    expect(r.notes?.startsWith('Bien')).toBe(true)
    expect(programDone([r]).get('T1')?.has(6)).toBe(true)
  })
  it('jour futur : séance prévue, qui ne coche pas la grille', () => {
    const r = workoutFromSession({ ...base, day: '2026-11-25' })
    expect(r.planned).toBe(true)
    expect(r.rpe).toBeUndefined()
    expect(programDone([r]).size).toBe(0)
    expect(programPlanned([r]).get('T1')?.has(6)).toBe(true)
  })
  it('valider une séance prévue : même enregistrement, plus « prévue »', () => {
    const planned = workoutFromSession({ ...base, day: '2026-11-25' })
    const done = workoutFromSession({ ...base, day: '2026-11-19', existing: planned })
    expect(done.id).toBe(planned.id)
    expect(done.planned).toBeUndefined()
    expect(programDone([done]).get('T1')?.has(6)).toBe(true)
  })
})

describe('doublons', () => {
  const list = [w('a', '2026-11-17', 'T1', 6), w('b', '2026-11-17', 'T1', 6, { deleted: true }), w('c', '2026-11-18', 'T1', 6)]
  it('même séance, même semaine, même jour', () => {
    expect(findDuplicate(list, 'T1', 6, '2026-11-17')?.id).toBe('a')
  })
  it('un autre jour, une autre semaine ou une séance supprimée ne comptent pas', () => {
    expect(findDuplicate(list, 'T1', 7, '2026-11-17')).toBeUndefined()
    expect(findDuplicate(list, 'T1', 6, '2026-11-20')).toBeUndefined()
    expect(findDuplicate([list[1]], 'T1', 6, '2026-11-17')).toBeUndefined()
  })
  it('on ignore la séance qu’on est en train de valider', () => {
    expect(findDuplicate(list, 'T1', 6, '2026-11-17', 'a')).toBeUndefined()
  })
})

describe('nettoyage des anciens liens', () => {
  it('« A2 S1 » du 17 novembre devient la semaine 6', () => {
    const { changes } = linkCleanup(program, [w('x', '2026-11-17', 'A2', 1)])
    expect(changes).toHaveLength(1)
    expect(changes[0].moves).toEqual([{ code: 'A2', from: 1, to: 6 }])
    expect(changes[0].oldTitle).toBe('A2 · S1')
    expect(changes[0].newTitle).toBe('A2 · S6')
    const fixed = applyLinkChange(w('x', '2026-11-17', 'A2', 1), changes[0])
    expect(fixed.program).toEqual([{ code: 'A2', week: 6 }])
    expect(fixed.title).toBe('A2 · S6')
  })
  it('ne touche pas ce qui est déjà juste, les coches, les supprimées ni les séances hors programme', () => {
    const r = linkCleanup(program, [
      w('ok', '2026-11-17', 'T1', 6),
      w('mark', '2026-11-17', 'A2', 1, { backfill: true }),
      w('del', '2026-11-17', 'A2', 1, { deleted: true }),
      w('old', '2026-06-01', 'T1', 2),
      { ...w('free', '2026-11-17', 'T1', 1), program: undefined },
    ])
    expect(r.changes).toHaveLength(0)
    expect(r.outside).toBe(1)
  })
  it('séance de deux refs : seule celle qui est fausse change, le titre suit', () => {
    const both = w('m', '2026-11-17', 'T1', 6, { title: 'T1 · S6 + A2 · S1', program: [{ code: 'T1', week: 6 }, { code: 'A2', week: 1 }] })
    const { changes } = linkCleanup(program, [both])
    expect(changes[0].moves).toEqual([{ code: 'A2', from: 1, to: 6 }])
    expect(changes[0].newTitle).toBe('T1 · S6 + A2 · S6')
  })
  it('une fois corrigé, plus rien à proposer', () => {
    const { changes } = linkCleanup(program, [w('x', '2026-11-17', 'A2', 1)])
    const fixed = applyLinkChange(w('x', '2026-11-17', 'A2', 1), changes[0])
    expect(linkCleanup(program, [{ ...fixed, id: 'x', day: '2026-11-17', deleted: false }]).changes).toHaveLength(0)
  })
})

import { completePlanned, pastPlanned } from './autoDone'
describe('journée passée : séance placée comptée comme faite', () => {
  const planned = (id: string, day: string, code: string, week: number, extra: Partial<Workout> = {}): Workout => ({ ...w(id, day, code, week), planned: true, ...extra })
  it('repère les séances prévues dont le jour est passé, pas celles d’aujourd’hui ni les sautées', () => {
    const list = [planned('a', '2026-11-19', 'T1', 6), planned('b', '2026-11-20', 'T1', 6), planned('c', '2026-11-18', 'T1', 6, { plan: { status: 'sautee' } }), w('d', '2026-11-19', 'T1', 6)]
    expect(pastPlanned(list, '2026-11-20').map((x) => x.id)).toEqual(['a'])
  })
  it('une séance du programme devient faite avec les séries prévues, et fait avancer la grille', () => {
    const r = completePlanned(planned('a', '2026-11-19', 'T1', 6), program, mk, true)
    expect(r.planned).toBeUndefined()
    expect(r.sets).toHaveLength(3)
    expect(r.notes).toContain('automatiquement')
    expect(programDone([r]).get('T1')?.has(6)).toBe(true)
  })
  it('une course garde sa durée ; une natation reste une natation', () => {
    const run = completePlanned({ ...planned('r', '2026-11-19', 'C1', 7), kind: 'course', durationMin: 30 }, program, mk, true)
    expect(run.run?.durationSec).toBe(1800)
    const swim = completePlanned({ id: 's', day: '2026-11-19', startedAt: '2026-11-19T12:00:00Z', durationMin: 45, kind: 'cardio', title: 'Natation', cardio: { modality: 'natation' }, planned: true, source: 'manual', updatedAt: 'x' }, program, mk, true)
    expect(swim.planned).toBeUndefined()
    expect(swim.cardio?.modality).toBe('natation')
  })
})
