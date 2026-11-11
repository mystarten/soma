import { describe, expect, it } from 'vitest'
import {
  buildFromProgram,
  matchExercise,
  missingExercises,
  parseCell,
  parseProgramDocument,
  parseRangeLabel,
  programDone,
  programStats,
  resolveWeekDates,
  suggestWeek,
  type DocBlock,
} from './program'

/* Programme fictif : aucune donnée personnelle. */
const DOC: DocBlock[] = [
  { type: 'p', text: 'Programme exemple · 5 janv. au 1 fév.    Légende' },
  { type: 'p', text: 'X1  Tirage lesté    60 min · lest maximum' },
  {
    type: 'table',
    rows: [
      ['Semaine', 'A. Lestées\nrepos 3:00 · il reste 2 reps', 'B. Poids du corps\nrepos 2:00', 'Fait'],
      ['S1  5-11 janv', '5 x 6  +20 kg', '5 x 15', ''],
      ['S2  12-18 janv · léger', '3 x 6  +20 kg', '3 x 15', ''],
      ['S3  19-25 janv', '5 x 7  +20 kg', '5 x 16', ''],
      ['S4  26 janv-1 fév · TEST', 'TEST  max reps à +20 kg', 'repos', ''],
    ],
  },
  { type: 'p', text: 'Y1  Gainage    15 min · 2 reps de réserve' },
  {
    type: 'table',
    rows: [
      ['Semaine', 'A. Planche\nrepos 1:00', 'B. Copenhagen\nrepos 1:00', 'Fait'],
      ['S1  12-18 janv', '3 x 40 s', '3 x 20 s genou fléchi', ''],
      ['S2  19-25 janv', '3 x 45 s', '3 x 25 s genou fléchi', ''],
    ],
  },
]

describe('lecture des dates', () => {
  it('lit les intervalles', () => {
    expect(parseRangeLabel('12-18 oct')).toEqual({ d1: 12, m1: 10, d2: 18, m2: 10 })
    expect(parseRangeLabel('28 déc-3 jan')).toEqual({ d1: 28, m1: 12, d2: 3, m2: 1 })
    expect(parseRangeLabel('rien')).toBeNull()
  })
  it('place les semaines et passe à l’année suivante', () => {
    const d = resolveWeekDates(['21-27 déc', '28 déc-3 jan', '4-10 jan'], '2026-11-11')
    expect(d[0]).toEqual({ start: '2026-12-21', end: '2026-12-27' })
    expect(d[1]).toEqual({ start: '2026-12-28', end: '2027-01-03' })
    expect(d[2]?.start).toBe('2027-01-04')
  })
})

describe('lecture d’une case', () => {
  it('séries × reps et charge', () => {
    const c = parseCell('4 x 10  +20 kg')
    expect(c.sets).toHaveLength(4)
    expect(c.sets[0]).toMatchObject({ reps: 10, loadKg: 20 })
    expect(parseCell('3 x 12 · 10 kg').sets[0]).toMatchObject({ reps: 12, loadKg: 10 })
    expect(parseCell('5 x 7  +12,5 kg').sets[0].loadKg).toBe(12.5)
  })
  it('tenues en secondes et consignes', () => {
    const c = parseCell('3 x 20 s genou fléchi')
    expect(c.sets[0]).toMatchObject({ holdSec: 20, note: 'genou fléchi' })
    expect(parseCell('3 x 8 pieds à la barre').sets[0]).toMatchObject({ reps: 8, note: 'pieds à la barre' })
    expect(parseCell('3 x 10 poids du corps').sets[0].note).toBeUndefined()
  })
  it('repos entre séries lu dans la case', () => {
    expect(parseCell('5 x 22  repos 4:00').sets[0]).toMatchObject({ reps: 22, restSec: 240 })
  })
  it('séries nommées, fractionné, EMOM', () => {
    expect(parseCell('60 - 55 - 50').sets.map((s) => s.reps)).toEqual([60, 55, 50])
    const f = parseCell('40 + 15 + 10')
    expect(f.sets).toHaveLength(1)
    expect(f.sets[0].reps).toBe(65)
    expect(parseCell('EMOM 10 min  8 / min').sets[0].reps).toBe(80)
    expect(parseCell('10 min  18 / min').sets[0].reps).toBe(180)
    expect(parseCell('32 reps').sets[0].reps).toBe(32)
  })
  it('mélange tractions et pompes à la minute', () => {
    const c = parseCell('16 min  11 tractions / 20 pompes')
    expect(c.sets.find((s) => s.hint === 'tractions')?.reps).toBe(88)
    expect(c.sets.find((s) => s.hint === 'pompes')?.reps).toBe(160)
  })
  it('pyramide : tractions puis pompes en double', () => {
    const c = parseCell('sommet 20 + 40  5-10-15-20-15-10-5')
    const t = c.sets.filter((s) => s.hint === 'tractions').map((s) => s.reps)
    expect(t).toEqual([5, 10, 15, 20, 15, 10, 5])
    expect(c.sets.filter((s) => s.hint === 'pompes').map((s) => s.reps)[3]).toBe(40)
  })
  it('repos, test, par tour', () => {
    expect(parseCell('repos').rest).toBe(true)
    const t = parseCell('TEST  max reps à +25 kg')
    expect(t.test).toBe(true)
    expect(t.sets[0].loadKg).toBe(25)
    expect(parseCell('330 m  1:48', { tours: 10 }).sets).toHaveLength(10)
    expect(parseCell('30', { tours: 4 }).sets).toHaveLength(4)
  })
  it('garde le texte d’une case inconnue sans rien perdre', () => {
    const c = parseCell('quelque chose d’étrange')
    expect(c.sets).toEqual([{ note: 'quelque chose d’étrange' }])
  })
})

describe('lecture du document', () => {
  const prog = parseProgramDocument(DOC, '2026-12-20')
  it('trouve le nom, les séances, les blocs et les semaines', () => {
    expect(prog.name).toBe('Programme exemple · 5 janv. au 1 fév.')
    expect(prog.sessions.map((s) => s.code)).toEqual(['X1', 'Y1'])
    const x = prog.sessions[0]
    expect(x.title).toBe('Tirage lesté')
    expect(x.durationMin).toBe(60)
    expect(x.blocks.map((b) => b.name)).toEqual(['A. Lestées', 'B. Poids du corps'])
    expect(x.blocks[0].restSec).toBe(180)
    expect(x.weeks.map((w) => w.n)).toEqual([1, 2, 3, 4])
    expect(x.weeks[1].light).toBe(true)
    expect(x.weeks[3].test).toBe(true)
    expect(x.weeks[0].startDay).toBe('2027-01-05')
  })
  it('chaque séance a ses propres semaines', () => {
    const y = prog.sessions[1]
    expect(y.weeks).toHaveLength(2)
    expect(y.weeks[0].startDay).toBe('2027-01-12')
  })
})

describe('correspondance avec les exercices', () => {
  it('reconnaît la bibliothèque', () => {
    expect(matchExercise('A. Lestées +25 kg', 'Tirage lesté').id).toBe('ex_tractions_lestees')
    expect(matchExercise('C. Muscle-ups', 'Tirage explosif').id).toBe('ex_muscle_up')
    expect(matchExercise('Pompes diamant', 'x').id).toBe('ex_pompes_diamant')
    expect(matchExercise('B. Série fractionnée', 'Pompes endurance').id).toBe('ex_pompes')
    expect(matchExercise('A. Presque max', 'Volume de tractions').id).toBe('ex_tractions_pronation')
  })
  it('crée ce qui manque', () => {
    const m = matchExercise('B. Copenhagen', 'Gainage')
    expect(m.custom?.name).toBe('Copenhagen')
    expect(m.custom?.mix.adducteurs).toBe(1)
    const prog = parseProgramDocument(DOC, '2026-12-20')
    expect(missingExercises(prog.sessions, new Set()).map((e) => e.name)).toContain('Copenhagen')
    expect(missingExercises(prog.sessions, new Set(['ex_prog_copenhagen'])).map((e) => e.name)).not.toContain('Copenhagen')
  })
})

describe('préparer une séance', () => {
  const prog = parseProgramDocument(DOC, '2026-12-20')
  let n = 0
  const mk = () => `s${n++}`
  it('préremplit les séries de la semaine choisie', () => {
    const w = buildFromProgram(prog, [{ code: 'X1', week: 2 }], mk)!
    expect(w.title).toBe('X1 · S2 léger')
    expect(w.sets.filter((s) => s.block === 'X1-1')).toHaveLength(3)
    expect(w.sets[0]).toMatchObject({ exerciseId: 'ex_tractions_lestees', reps: 6, loadKg: 20, restSec: 180 })
    expect(w.program).toEqual([{ code: 'X1', week: 2 }])
  })
  it('combine plusieurs séances de semaines différentes', () => {
    const w = buildFromProgram(prog, [{ code: 'X1', week: 1 }, { code: 'Y1', week: 2 }], mk)!
    expect(w.program).toHaveLength(2)
    expect(w.durationMin).toBe(75)
    expect(new Set(w.sets.map((s) => s.block))).toEqual(new Set(['X1-1', 'X1-2', 'Y1-1', 'Y1-2']))
    expect(w.sets.find((s) => s.exerciseId === 'ex_gainage')?.holdSec).toBe(45)
  })
  it('un jour de repos ne crée aucune série', () => {
    const w = buildFromProgram(prog, [{ code: 'X1', week: 4 }], mk)!
    expect(w.sets.every((s) => s.exerciseId === 'ex_tractions_lestees')).toBe(true)
    expect(w.sets).toHaveLength(1)
  })
  it('séance ou semaine inconnue : rien', () => {
    expect(buildFromProgram(prog, [{ code: 'Z9', week: 1 }], mk)).toBeNull()
  })
})

describe('suivi du programme', () => {
  const prog = parseProgramDocument(DOC, '2026-12-20')
  const workouts = [{ program: [{ code: 'X1', week: 1 }] }, { program: [{ code: 'X1', week: 3 }, { code: 'Y1', week: 1 }] }]
  it('retient ce qui est fait, dans le désordre', () => {
    const d = programDone(workouts)
    expect([...(d.get('X1') ?? [])].sort()).toEqual([1, 3])
    expect(d.get('Y1')?.has(1)).toBe(true)
  })
  it('propose la semaine du jour, sinon la première non faite', () => {
    const x = prog.sessions[0]
    expect(suggestWeek(x, new Set([1, 3]), '2027-01-13')).toBe(2)
    expect(suggestWeek(x, new Set([1]), '2027-01-13')).toBe(2)
    expect(suggestWeek(x, new Set([1, 2]), '2027-01-13')).toBe(3)
    expect(suggestWeek(x, new Set([1, 2, 3, 4]), '2030-01-01')).toBe(1)
  })
  it('compte les séances faites', () => {
    const s = programStats(prog, workouts, '2027-01-13')
    expect(s.total).toBe(6)
    expect(s.done).toBe(3)
    expect(s.thisWeekTotal).toBe(2)
  })
})
