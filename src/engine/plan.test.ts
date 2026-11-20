import { describe, expect, it } from 'vitest'
import type { Program, ProgramSession } from '../types'
import { buildPlan, planSettings, planWarnings, type PlanEntry, type PlanEvent, type PlanInput } from './plan'
import { addDayKey } from './time'

const START = '2026-10-12'
const weeks = () => Array.from({ length: 12 }, (_, i) => ({ n: i + 1, label: `S${i + 1}`, startDay: addDayKey(START, 7 * i), endDay: addDayKey(START, 7 * i + 6), light: i === 4 || i === 9, test: i === 11 }))
const sess = (code: string, from = 0): ProgramSession => ({ code, title: `Séance ${code}`, durationMin: 50, weeks: weeks(), blocks: [{ name: 'Bloc', cells: Array.from({ length: 12 }, (_, i) => (i < from ? '' : '3 x 5')) }] })
const program: Pick<Program, 'sessions'> = { sessions: [...['T1', 'T2', 'T3', 'T4', 'M1', 'P2', 'A1', 'A2', 'A3', 'J1', 'J2'].map((c) => sess(c)), sess('C1', 6)] }
const settings = planSettings({}, program)
const base = (over: Partial<PlanInput> = {}): PlanInput => ({ program, today: '2026-11-20', days: 28, settings, history: [], locked: [], ...over })
const ev = (day: string, kind: PlanEvent['kind'], code?: string): PlanEvent => ({ day, kind, code })
const lockedEntry = (day: string, kind: PlanEvent['kind'], code?: string): PlanEntry => ({ id: `L${day}${code}`, day, kind, code, locked: true, reason: '', title: code ?? kind, durationMin: 50 })
const all = (r: { entries: PlanEntry[] }, input: PlanInput): PlanEvent[] => [...input.history, ...input.locked, ...r.entries]
const range = (i: PlanInput) => [addDayKey(i.today, -8), addDayKey(i.today, i.days - 1)] as const

describe('plan : règles dures', () => {
  for (const [today, days] of [['2026-11-20', 28], ['2026-10-12', 28], ['2026-12-01', 28]] as const) {
    it(`aucune règle dure enfreinte (départ ${today})`, () => {
      const i = base({ today, days })
      const r = buildPlan(i)
      expect(r.entries.length).toBeGreaterThan(8)
      const [a, b] = range(i)
      expect(planWarnings(all(r, i), a, b).filter((w) => w.hard)).toEqual([])
    })
  }
  it('jamais plus de 2 jours de street de suite', () => {
    const r = buildPlan(base())
    const days = (f: (e: PlanEntry) => boolean) => new Set(r.entries.filter(f).map((e) => e.day))
    const street = days((e) => e.kind === 'street')
    for (const d of street) expect(street.has(addDayKey(d, -1)) && street.has(addDayKey(d, -2))).toBe(false)
  })
  it('aucune séance après le 3 janvier 2027', () => {
    const r = buildPlan(base({ today: '2026-12-20', days: 28 }))
    expect(r.end).toBe('2027-01-03')
    expect(r.entries.length).toBeGreaterThan(0)
    expect(r.entries.every((e) => e.day <= '2027-01-03')).toBe(true)
  })
  it('pas de course 2 jours de suite, 3 sorties par semaine de la 7 à la 10', () => {
    const r = buildPlan(base({ today: '2026-11-23', days: 28 }))
    const runs = r.entries.filter((e) => e.kind === 'course').map((e) => e.day)
    for (const d of runs) expect(runs.includes(addDayKey(d, 1))).toBe(false)
    expect(runs.filter((d) => d >= '2026-11-23' && d <= '2026-11-29')).toHaveLength(3)
    expect(runs.filter((d) => d >= '2026-11-30' && d <= '2026-12-06')).toHaveLength(3)
  })
  it('2 sorties par semaine si on le règle ainsi', () => {
    const r = buildPlan(base({ today: '2026-11-23', days: 7, settings: { ...settings, runsPerWeek: 2 } }))
    expect(r.entries.filter((e) => e.kind === 'course')).toHaveLength(2)
  })
  it('pas de course avant la semaine 7 (la séance n’a pas de contenu)', () => {
    const r = buildPlan(base({ today: '2026-11-16', days: 7 }))
    expect(r.entries.filter((e) => e.kind === 'course')).toHaveLength(0)
  })
})

describe('plan : ordre de rotation du street', () => {
  it('suit l’ordre fixe, à partir de la dernière séance faite', () => {
    const r = buildPlan(base({ today: '2026-11-23', history: [ev('2026-11-20', 'street', 'T2'), ev('2026-11-21', 'street', 'M1')] }))
    const codes = r.entries.filter((e) => e.kind === 'street').map((e) => e.code)
    expect(codes.slice(0, 7)).toEqual(['T3', 'T4', 'T1', 'P2', 'T2', 'M1', 'T3'].slice(0, 7))
  })
  it('on ne saute pas : après T2, la suite est M1, même juste après un tirage (pas de règle des 48 h)', () => {
    const r = buildPlan(base({ today: '2026-11-20', days: 1, history: [ev('2026-11-19', 'street', 'T2')] }))
    expect(r.entries.find((e) => e.kind === 'street')?.code).toBe('M1')
  })
  it('un ordre modifié dans les réglages est respecté', () => {
    const s = planSettings({ planStreetOrder: ['T4', 'T3', 'T2', 'T1', 'M1', 'P2'] }, program)
    const r = buildPlan(base({ settings: s }))
    expect(r.entries.find((e) => e.kind === 'street')?.code).toBe('T4')
  })
})

describe('plan : flexibilité', () => {
  it('2 jours sans street une semaine et 3 une autre sont possibles (avec assez de séances de poussée dans l’ordre)', () => {
    const prog: Pick<Program, 'sessions'> = { sessions: [...program.sessions, sess('P1'), sess('P3')] }
    const s = planSettings({ planStreetOrder: ['T1', 'P1', 'T2', 'P2', 'M1', 'P3', 'T3', 'T4'] }, prog)
    const r = buildPlan(base({ program: prog, settings: s, today: '2026-10-12', days: 28 }))
    const streetDays = new Set(r.entries.filter((e) => e.kind === 'street').map((e) => e.day))
    const free = [0, 1, 2, 3].map((w) => Array.from({ length: 7 }, (_, k) => addDayKey('2026-10-12', 7 * w + k)).filter((d) => !streetDays.has(d)).length)
    expect(free.some((n) => n === 2)).toBe(true)
    expect(free.some((n) => n === 3)).toBe(true)
    const i = base({ program: prog, settings: s, today: '2026-10-12', days: 28 })
    expect(planWarnings(all(r, i), '2026-10-04', '2026-11-08').filter((w) => w.hard)).toEqual([])
  })
  it('le rythme est d’environ 5 jours de street sur 7', () => {
    const r = buildPlan(base({ today: '2026-10-12', days: 28 }))
    const n = r.entries.filter((e) => e.kind === 'street').length
    expect(n).toBeGreaterThanOrEqual(16)
    expect(n).toBeLessThanOrEqual(21)
  })
  it('un jour indisponible au milieu de la semaine : rien dessus, règles dures intactes', () => {
    const i = base({ today: '2026-11-23', blocked: ['2026-11-25'] })
    const r = buildPlan(i)
    expect(r.entries.some((e) => e.day === '2026-11-25')).toBe(false)
    const [a, b] = range(i)
    expect(planWarnings(all(r, i), a, b).filter((w) => w.hard)).toEqual([])
    expect(r.entries.filter((e) => e.kind === 'street').length).toBeGreaterThan(5)
  })
  it('ton planning posé à la main est respecté, l’algorithme n’ajoute aucune infraction autour', () => {
    const history = [ev('2026-11-18', 'street', 'M1'), ev('2026-11-19', 'street', 'T2')]
    const locked = [lockedEntry('2026-11-21', 'street', 'T3'), lockedEntry('2026-11-21', 'course', 'C1'), lockedEntry('2026-11-22', 'street', 'T4'), lockedEntry('2026-11-24', 'street', 'P2')]
    const i = base({ history, locked })
    const r = buildPlan(i)
    expect(r.entries.some((e) => e.id.includes('2026-11-21_T3'))).toBe(false)
    const own = new Set([...history, ...locked].map((e) => e.day))
    const bad = planWarnings(all(r, i), '2026-11-12', '2026-12-17').filter((w) => w.hard)
    expect(bad.every((w) => own.has(w.day))).toBe(true)
    /* après P2 du mardi : la suite de l’ordre est T2 */
    const after = r.entries.filter((e) => e.kind === 'street' && e.day > '2026-11-24')
    expect(after[0].code).toBe('T2')
    expect(r.entries.every((e) => e.reason.length > 5)).toBe(true)
  })
})

describe('avertissements sur tes propres placements', () => {
  it('signale sans bloquer', () => {
    const w = planWarnings([ev('2026-11-21', 'street', 'T3'), ev('2026-11-22', 'street', 'T4'), ev('2026-11-23', 'street', 'P2'), ev('2026-11-23', 'street', 'T1'), ev('2026-11-23', 'course', 'C1'), ev('2026-11-24', 'course', 'C1')], '2026-11-20', '2026-11-30')
    const texts = w.map((x) => x.text)
    expect(texts).not.toContain('Deux tirages à moins de 48 h')
    expect(texts.some((t) => t.startsWith('3 jours de street de suite'))).toBe(true)
    expect(texts).toContain('Course 2 jours de suite')
    expect(texts).toContain('Plusieurs séances dures le même jour')
  })
})

describe('plan : règles souples', () => {
  it('sans séances posées à la main (hors semaines de course à 3 sorties), le plan garde un jour de repos sur 7 et jamais plus de 2 séances par jour', () => {
    for (const today of ['2026-10-12', '2026-10-19', '2026-12-21']) {
      const i = base({ today, days: 28 })
      const r = buildPlan(i)
      const w = planWarnings(all(r, i), addDayKey(today, -6), addDayKey(today, 27))
      expect(w.filter((x) => x.text.includes('repos') || x.text.includes('Plus de 2') || x.text.includes('veille'))).toEqual([])
    }
  })
})
