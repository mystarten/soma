import { describe, expect, it } from 'vitest'
import type { Program, ProgramSession, Settings, Workout } from '../types'
import { buildPlan, planSettings, planWarnings, type PlanEvent } from './plan'
import { entryToWorkout, historyEvents, lockedEntries, previewBlock, previewMove, previewRecalc, type PlanContext, type PlanPreview } from './planStore'
import { addDayKey } from './time'

const START = '2026-10-12'
const weeks = () => Array.from({ length: 12 }, (_, i) => ({ n: i + 1, label: `S${i + 1}`, startDay: addDayKey(START, 7 * i), endDay: addDayKey(START, 7 * i + 6) }))
const sess = (code: string, from = 0): ProgramSession => ({ code, title: code, durationMin: 50, weeks: weeks(), blocks: [{ name: 'B', cells: Array.from({ length: 12 }, (_, i) => (i < from ? '' : '3 x 5')) }] })
const program: Pick<Program, 'sessions'> = { sessions: [...['T1', 'T2', 'T3', 'T4', 'M1', 'P2', 'A1', 'A2', 'A3', 'J1', 'J2'].map((c) => sess(c)), sess('C1', 6)] }
const settings = { planBlocked: [] } as unknown as Settings
const TODAY = '2026-11-23'

/** Un plan enregistré (séances prévues) à partir de l'algorithme. */
function stored(today = TODAY, history: Workout[] = []): Workout[] {
  const r = buildPlan({ program, today, days: 28, settings: planSettings({}, program), history: historyEvents(history), locked: [] })
  return [...history, ...r.entries.map((e) => entryToWorkout(e, '2026-11-20T00:00:00Z'))]
}
const ctx = (workouts: Workout[], blocked: string[] = [], today = TODAY, days = 28): PlanContext => ({ program, today, days, settings, workouts, blocked })

/** Applique un aperçu comme le ferait l'application (sans base de données). */
function apply(workouts: Workout[], p: PlanPreview): Workout[] {
  const gone = new Set([...p.diff.remove.map((w) => w.id), ...p.dropped.map((w) => w.id), ...(p.moved ? [p.moved.id] : [])])
  const kept = workouts.filter((w) => !gone.has(w.id))
  const rows = new Map<string, Workout>(kept.map((w) => [w.id, w]))
  for (const w of [...(p.moved ? [p.moved] : []), ...p.diff.add.map((e) => entryToWorkout(e, 'x'))]) rows.set(w.id, w)
  return [...rows.values()]
}
const events = (ws: Workout[], today = TODAY): PlanEvent[] => {
  const out = historyEvents(ws)
  for (const e of lockedEntries(ws, today)) out.push(e)
  for (const w of ws) if (w.planned && !w.deleted && w.plan?.auto && !w.plan.locked && w.plan.status !== 'sautee') out.push(...lockedEntries([{ ...w, plan: { ...w.plan, auto: false } }], today))
  return out
}
const hard = (ws: Workout[], today = TODAY) => planWarnings(events(ws, today), addDayKey(today, -8), addDayKey(today, 27)).filter((w) => w.hard)
const streetSeq = (ws: Workout[]) => ws.filter((w) => w.planned && !w.deleted && w.kind === 'street' && w.program?.[0]?.code.match(/^[TMP]/)).sort((a, b) => a.day.localeCompare(b.day)).map((w) => w.program![0].code)

describe('décaler une séance', () => {
  const ws = stored()
  const t1 = ws.filter((w) => w.program?.[0]?.code === 'T1').sort((a, b) => a.day.localeCompare(b.day))[0]

  it('décaler T1 d’un jour : les séances de street suivantes se recalculent, l’ordre est conservé, jamais 3 jours de street de suite', () => {
    const before = streetSeq(ws)
    const p = previewMove(ctx(ws), t1.id, addDayKey(t1.day, 1))
    if ('error' in p) throw new Error(p.error)
    expect(p.moved?.plan?.locked).toBe(true)
    expect(p.moved?.plan?.status).toBe('decalee')
    expect(p.moved?.plan?.originalDay).toBe(t1.day)
    const after = apply(ws, p)
    expect(after.find((w) => w.id === t1.id)?.day).toBe(addDayKey(t1.day, 1))
    expect(hard(after)).toEqual([])
    /* l'ordre de rotation est conservé : chaque séance suit la précédente dans T1, P2, T2, M1, T3, T4 */
    const order = ['T1', 'P2', 'T2', 'M1', 'T3', 'T4']
    const seq = streetSeq(after)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBe(order[(order.indexOf(seq[i - 1]) + 1) % 6])
    expect(seq.length).toBeGreaterThan(before.length - 3)
    expect(p.diff.changes.length).toBeGreaterThan(0)
  })
  it('décaler de 2 jours ou à une date précise garde aussi les règles dures', () => {
    for (const shift of [2, 5]) {
      const p = previewMove(ctx(ws), t1.id, addDayKey(t1.day, shift))
      if ('error' in p) throw new Error(p.error)
      expect(hard(apply(ws, p))).toEqual([])
    }
  })
  it('la semaine du programme suit la nouvelle date', () => {
    const run = ws.filter((w) => w.program?.[0]?.code === 'C1')[0]
    const p = previewMove(ctx(ws), run.id, addDayKey(run.day, 7))
    if ('error' in p) throw new Error(p.error)
    expect(p.moved?.program?.[0].week).toBe((run.program?.[0].week ?? 0) + 1)
    expect(p.moved?.title).toContain(`S${(run.program?.[0].week ?? 0) + 1}`)
  })
  it('refuse après le 3 janvier 2027 et avant aujourd’hui', () => {
    expect('error' in previewMove(ctx(ws), t1.id, '2027-01-05')).toBe(true)
    expect('error' in previewMove(ctx(ws), t1.id, '2026-11-01')).toBe(true)
  })
  it('un placement qui enfreint une règle est accepté, avec avertissement', () => {
    const other = ws.filter((w) => w.program?.[0]?.code === 'T2').sort((a, b) => a.day.localeCompare(b.day))[0]
    const p = previewMove(ctx(ws), other.id, addDayKey(t1.day, 1))
    if ('error' in p) throw new Error(p.error)
    expect(p.moved?.day).toBe(addDayKey(t1.day, 1))
  })
})

describe('jour indisponible', () => {
  const ws = stored()
  const mid = addDayKey(TODAY, 3)
  it('rien n’est placé ce jour-là et les règles dures restent intactes', () => {
    const p = previewBlock(ctx(ws), mid)
    const after = apply(ws, p)
    expect(after.some((w) => w.planned && !w.deleted && w.day === mid && w.plan?.status !== 'sautee')).toBe(false)
    expect(hard(after)).toEqual([])
    /* le plan recalculé avec ce jour bloqué ne propose rien dessus */
    const again = previewRecalc(ctx(after, [mid]))
    expect(again.diff.changes).toEqual([])
  })
  it('tes propres séances posées ce jour-là ne sont ni supprimées ni déplacées sans toi', () => {
    const manual: Workout = { id: 'm1', day: mid, startedAt: `${mid}T12:00:00.000Z`, durationMin: 60, kind: 'street', title: 'T3 · S6', program: [{ code: 'T3', week: 6 }], planned: true, source: 'manual', updatedAt: 'x' }
    const p = previewBlock(ctx([manual]), mid)
    expect(p.dropped).toEqual([])
    expect(p.diff.remove).toEqual([])
  })
})

describe('séance faite hors plan', () => {
  it('une séance supplémentaire faite aujourd’hui déclenche un recalcul à prévisualiser', () => {
    const ws = stored()
    const done: Workout = { id: 'd1', day: TODAY, startedAt: `${TODAY}T08:00:00.000Z`, durationMin: 40, kind: 'street', title: 'T3 · S7', program: [{ code: 'T3', week: 7 }], rpe: 7, source: 'manual', updatedAt: 'x' }
    const p = previewRecalc(ctx([...ws.filter((w) => w.day !== TODAY), done]))
    expect(p.diff.changes.length).toBeGreaterThan(0)
    const after = apply([...ws.filter((w) => w.day !== TODAY), done], p)
    expect(hard(after)).toEqual([])
    /* la suite de l'ordre repart après T3 */
    const next = after.filter((w) => w.planned && !w.deleted && w.kind === 'street' && w.program?.[0]?.code.match(/^[TMP]/)).sort((a, b) => a.day.localeCompare(b.day))[0]
    expect(next.program?.[0].code).toBe('T4')
  })
})

describe('stabilité du recalcul', () => {
  it('décaler une séance de street n’entraîne qu’un ajustement limité des abdos, jambes et courses', () => {
    const ws = stored()
    const t2 = ws.filter((w) => w.program?.[0]?.code === 'T2').sort((a, b) => a.day.localeCompare(b.day))[0]
    const p = previewMove(ctx(ws, [], TODAY, 14), t2.id, addDayKey(t2.day, 1))
    if ('error' in p) throw new Error(p.error)
    const lines = p.diff.changes.map((c) => c.label)
    const nonStreet = lines.filter((l) => !/^[TMP]\d/.test(l))
    /* tous les jours de street glissent d'un cran (rythme de 48 h entre tirages) : les autres séances s'ajustent autour, sans plus */
    expect(nonStreet.length).toBeLessThanOrEqual(8)
  })
})
