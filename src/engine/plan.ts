import type { DayKey, Program, Settings } from '../types'
import { addDayKey, dayDiff } from './time'
import { isPlannedWeek } from './program'
import { programStartDay, sessionWeekOn } from './todayPlan'
import { socleOf } from './rotation'

/* ──────────────────────────────────────────────────────────────────────────
   Plan glissant : place les séances sur les prochains jours.
   Règles dures (l'algorithme ne les enfreint jamais) :
     – 2 jours de street de suite au maximum (on n'enchaîne pas les grosses séances) ;
     – pas de course 2 jours de suite ; – rien après la fin du programme.
   Règles souples (avertissements, jamais bloquants) : un jour de repos sur 7, pas de jambes la veille d'une course,
   2 séances par jour au plus, une seule séance dure par jour.
   Tirage = T1 à T4 et M1. Pur, sans React : testé dans plan.test.ts.
   ────────────────────────────────────────────────────────────────────────── */

export type PlanKind = 'street' | 'jambes' | 'abdos' | 'course' | 'natation' | 'velo'

export interface PlanEvent {
  day: DayKey
  kind: PlanKind
  code?: string
}

export interface PlanEntry extends PlanEvent {
  id: string
  /** Semaine du programme qui contient ce jour (la prescription en dépend). */
  week?: number
  locked: boolean
  reason: string
  title: string
  durationMin: number
}

export interface PlanSettings {
  order: string[]
  runsPerWeek: 2 | 3
  natationDow: number
  veloDow: number
}

export interface PlanInput {
  program: Pick<Program, 'sessions'>
  today: DayKey
  /** 14 ou 28 jours. */
  days: number
  override?: DayKey
  settings: PlanSettings
  /** Séances déjà faites (ou en cours) : elles pèsent sur le rythme et la rotation. */
  history: PlanEvent[]
  /** Séances posées à la main ou épinglées : l'algorithme les respecte et organise le reste autour. */
  locked: PlanEntry[]
  /** Jours indisponibles : rien n'y est placé. */
  blocked?: DayKey[]
  /** Le plan précédent : pour la course, les jambes et les abdos, l'algorithme garde les mêmes jours quand c'est encore possible (peu de changements à valider). */
  prefer?: PlanEvent[]
}

export interface PlanResult {
  /** Les séances proposées par l'algorithme (hors séances verrouillées). */
  entries: PlanEntry[]
  notes: string[]
  end: DayKey
}

const MONTH_TITLE = (s: { code: string; title: string }) => s.title || s.code

export const isPull = (e: Pick<PlanEvent, 'kind' | 'code'>): boolean => e.kind === 'street' && /^[TM]/i.test(e.code ?? '')

export const dowOf = (d: DayKey): number => new Date(`${d}T12:00:00`).getDay()

/** Le plan s'arrête à la fin du programme (dernier jour de la dernière semaine). */
export function planEnd(program: Pick<Program, 'sessions'>, today: DayKey, override?: DayKey): DayKey {
  const first = programStartDay(program, override)
  if (!first) return addDayKey(today, 27)
  const total = Math.max(1, ...program.sessions.map((s) => s.weeks.length))
  return addDayKey(first, 7 * total - 1)
}

/** L'ordre de rotation du street : celui des réglages, complété par les séances street du programme qui n'y figurent pas. */
export function planSettings(settings: Pick<Settings, 'planStreetOrder' | 'planRunsPerWeek' | 'planNatationDow' | 'planVeloDow'>, program: Pick<Program, 'sessions'> | null): PlanSettings {
  const street = (program?.sessions ?? []).filter((s) => socleOf(s.code) === 'street').map((s) => s.code)
  const wanted = settings.planStreetOrder?.length ? settings.planStreetOrder : ['T1', 'P2', 'T2', 'M1', 'T3', 'T4']
  const order = [...wanted.filter((c) => street.includes(c)), ...street.filter((c) => !wanted.includes(c))]
  return { order, runsPerWeek: settings.planRunsPerWeek === 2 ? 2 : 3, natationDow: settings.planNatationDow ?? 6, veloDow: settings.planVeloDow ?? 0 }
}

class Cal {
  private m = new Map<DayKey, PlanEvent[]>()
  add(e: PlanEvent) {
    this.m.set(e.day, [...(this.m.get(e.day) ?? []), e])
  }
  on(d: DayKey): PlanEvent[] {
    return this.m.get(d) ?? []
  }
  has(d: DayKey, f: (e: PlanEvent) => boolean) {
    return this.on(d).some(f)
  }
  count(f: (e: PlanEvent) => boolean, from: DayKey, to: DayKey): number {
    let n = 0
    for (let d = from; d <= to; d = addDayKey(d, 1)) n += this.on(d).filter(f).length
    return n
  }
}
const isStreet = (e: PlanEvent) => e.kind === 'street'
const isRun = (e: PlanEvent) => e.kind === 'course'
const isHard = (e: PlanEvent) => e.kind === 'street' || e.kind === 'jambes' || e.kind === 'course'
/** Séance dure pour la règle « une seule par jour » : tirage, jambes, course (la poussée d'endurance P2 se combine avec une course ou des abdos). */
const isHardWarn = (e: PlanEvent) => isPull(e) || e.kind === 'jambes' || e.kind === 'course'

export function buildPlan(input: PlanInput): PlanResult {
  const { program, today, settings, override } = input
  const end = planEnd(program, today, override)
  const last = addDayKey(today, input.days - 1) < end ? addDayKey(today, input.days - 1) : end
  const blocked = new Set(input.blocked ?? [])
  const first = programStartDay(program, override) ?? today
  const cal = new Cal()
  for (const e of input.history) cal.add(e)
  for (const e of input.locked) cal.add(e)
  const entries: PlanEntry[] = []
  const notes: string[] = []
  const place = (e: PlanEntry) => {
    entries.push(e)
    cal.add(e)
  }

  const session = (code: string) => program.sessions.find((s) => s.code === code)
  const weekOf = (code: string, d: DayKey): number | null => {
    const s = session(code)
    if (!s) return null
    const sw = sessionWeekOn(program, s, d, override)
    return sw && isPlannedWeek(s, sw.week) ? sw.week.n : null
  }
  const days: DayKey[] = []
  for (let d = today; d <= last; d = addDayKey(d, 1)) days.push(d)
  const mk = (kind: PlanKind, d: DayKey, code: string | undefined, reason: string, activity?: string): PlanEntry => {
    const s = code ? session(code) : undefined
    return {
      id: `plan_${d}_${code ?? activity ?? kind}`,
      day: d,
      kind,
      code,
      week: code ? (weekOf(code, d) ?? undefined) : undefined,
      locked: false,
      reason,
      title: s ? MONTH_TITLE(s) : (activity ?? kind),
      durationMin: s?.durationMin ?? (kind === 'natation' ? 45 : kind === 'velo' ? 90 : 30),
    }
  }

  /* Un jour sans aucune séance au moins dans chaque fenêtre de 7 jours qui contient d (en comptant d comme occupé). */
  const keepsRest = (d: DayKey): boolean => {
    for (let s = addDayKey(d, -6); s <= d; s = addDayKey(s, 1)) {
      let free = false
      for (let x = s; x <= addDayKey(s, 6); x = addDayKey(x, 1)) if (x !== d && cal.on(x).length === 0) free = true
      if (!free) return false
    }
    return true
  }

  /* ── 1. Street, dans l'ordre fixe ───────────────────────────────────── */
  const cycle = settings.order
  const lastStreetCode = (d: DayKey): string | undefined => {
    for (let x = addDayKey(d, -1), i = 0; i < 60; x = addDayKey(x, -1), i++) {
      const hit = [...cal.on(x)].reverse().find((e) => isStreet(e) && e.code && cycle.includes(e.code))
      if (hit) return hit.code
    }
    return undefined
  }
  for (const d of days) {
    if (blocked.has(d) || !cycle.length) continue
    if (cal.has(d, isHard)) continue
    const prev = lastStreetCode(d)
    const start = prev ? cycle.indexOf(prev) + 1 : 0
    let next: string | undefined
    for (let i = 0; i < cycle.length; i++) {
      const c = cycle[(start + i) % cycle.length]
      if (weekOf(c, d) !== null) {
        next = c
        break
      }
    }
    if (!next) continue
    /* Une séance déjà posée (ou décalée) un peu plus tard : on l'attend au lieu de la proposer deux fois, l'ordre est conservé. */
    if (input.locked.some((l) => l.kind === 'street' && l.code === next && l.day > d && dayDiff(l.day, d) <= 9)) continue
    const s = (x: number) => cal.has(addDayKey(d, x), isStreet)
    if ((s(-1) && s(-2)) || (s(-1) && s(1)) || (s(1) && s(2))) continue
    if (cal.count(isStreet, addDayKey(d, -6), addDayKey(d, -1)) >= 5) continue
    place(mk('street', d, next, `Suite de ton ordre${prev ? ` (après ${prev})` : ''}`))
  }

  /* Les semaines du programme (lundi → dimanche d'après le début du programme) couvertes par le plan. */
  const progWeek = (d: DayKey) => Math.floor(dayDiff(d, first) / 7)
  const chunks = new Map<number, DayKey[]>()
  for (const d of days) chunks.set(progWeek(d), [...(chunks.get(progWeek(d)) ?? []), d])
  const weekStartOf = (w: number) => addDayKey(first, 7 * w)

  /** Choisit jusqu'à `need` jours parmi les candidats : jamais deux jours collés, le moins coûteux, le plus régulier possible. */
  const pickDays = (cands: { day: DayKey; cost: number }[], need: number, apart: (a: DayKey, b: DayKey) => boolean): DayKey[] => {
    for (let size = Math.min(need, cands.length); size >= 1; size--) {
      let best: { days: DayKey[]; score: number } | null = null
      const rec = (i: number, chosen: typeof cands) => {
        if (chosen.length === size) {
          const ds = chosen.map((c) => c.day)
          const gaps = ds.slice(1).map((x, k) => dayDiff(x, ds[k]))
          const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
          const score = chosen.reduce((a, c) => a + c.cost, 0) * 3 + gaps.reduce((a, g) => a + (g - mean) ** 2, 0)
          if (!best || score < best.score) best = { days: ds, score }
          return
        }
        for (let j = i; j < cands.length; j++) if (chosen.every((c) => apart(c.day, cands[j].day))) rec(j + 1, [...chosen, cands[j]])
      }
      rec(0, [])
      if (best) return (best as { days: DayKey[] }).days
    }
    return []
  }
  const liked = (d: DayKey, kind: PlanKind) => ((input.prefer ?? []).some((p) => p.day === d && p.kind === kind) ? -4 : 0)
  const notAdjacent = (a: DayKey, b: DayKey) => Math.abs(dayDiff(a, b)) >= 2

  /* ── 2. Course : 3 sorties par semaine (semaines 7 à 10), sinon 2 ; jamais deux jours de suite ── */
  const lastOf = (kind: PlanKind, d: DayKey): string | undefined => {
    for (let x = addDayKey(d, -1), i = 0; i < 60; x = addDayKey(x, -1), i++) {
      const hit = [...cal.on(x)].reverse().find((e) => e.kind === kind && e.code)
      if (hit) return hit.code
    }
    return undefined
  }
  const nextCode = (kind: PlanKind, d: DayKey): string | undefined => {
    const codes = program.sessions.filter((s) => socleOf(s.code) === kind).map((s) => s.code).sort()
    const prev = lastOf(kind, d)
    const start = prev ? codes.indexOf(prev) + 1 : 0
    for (let i = 0; i < codes.length; i++) {
      const c = codes[(start + i) % codes.length]
      if (weekOf(c, d) !== null) return c
    }
    return undefined
  }
  const weekTarget = (kind: PlanKind, w: number): number => {
    if (kind === 'course') return w >= 6 && w <= 9 ? settings.runsPerWeek : 2
    return 2
  }
  const countInWeek = (kind: PlanKind, w: number) => cal.count((e) => e.kind === kind, weekStartOf(w), addDayKey(weekStartOf(w), 6))

  for (const [w, wd] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
    const need = weekTarget('course', w) - countInWeek('course', w)
    const cands = wd
      .filter((d) => !blocked.has(d) && nextCode('course', d) && !cal.has(d, (e) => isRun(e) || e.kind === 'jambes') && !cal.has(addDayKey(d, -1), isRun) && !cal.has(addDayKey(d, 1), isRun) && !cal.has(addDayKey(d, -1), (e) => e.kind === 'jambes'))
      .map((d) => ({ day: d, cost: (cal.has(d, isPull) ? 2 : cal.on(d).length ? 0 : 1) + (cal.on(d).length === 0 && !keepsRest(d) ? 4 : 0) + liked(d, 'course') }))
    const picked = pickDays(cands, need, notAdjacent)
    let n = countInWeek('course', w)
    for (const d of picked) {
      n += 1
      place(mk('course', d, nextCode('course', d), `Course n°${n} de la semaine, pas collée à une autre sortie`))
    }
    if (picked.length < need && addDayKey(weekStartOf(w), 6) <= last && wd.some((d) => nextCode('course', d))) notes.push(`Semaine du ${weekStartOf(w).slice(8)}/${weekStartOf(w).slice(5, 7)} : ${need - picked.length} sortie(s) de course non placée(s), pas de jour libre sans casser tes règles.`)
  }

  /* ── 3. Activités fixes : natation, VTT (déplaçables) ─────────────── */
  for (const d of days) {
    if (blocked.has(d) || cal.on(d).length || !keepsRest(d)) continue
    if (dowOf(d) === settings.natationDow) place(mk('natation', d, undefined, 'Ton habitude du jour (déplaçable), sans séance de street ce jour-là', 'Natation'))
    else if (dowOf(d) === settings.veloDow) place(mk('velo', d, undefined, 'Ton habitude du jour (déplaçable), sans séance de street ce jour-là', 'VTT'))
  }

  /* ── 4. Jambes : jours sans tirage, sans course, pas la veille d'une course ── */
  for (const [w, wd] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
    const need = weekTarget('jambes', w) - countInWeek('jambes', w)
    const cands = wd
      .filter((d) => !blocked.has(d) && nextCode('jambes', d) && !cal.has(d, (e) => isHard(e)) && !cal.has(addDayKey(d, 1), isRun) && !cal.has(addDayKey(d, -1), (e) => e.kind === 'jambes') && !cal.has(addDayKey(d, 1), (e) => e.kind === 'jambes'))
      .filter((d) => cal.on(d).length > 0 || keepsRest(d))
      .map((d) => ({ day: d, cost: (cal.on(d).length ? 1 : 0) + liked(d, 'jambes') }))
    for (const d of pickDays(cands, need, notAdjacent)) if (cal.on(d).length > 0 || keepsRest(d)) place(mk('jambes', d, nextCode('jambes', d), 'Jour sans tirage ni course, et pas la veille d’une sortie de course'))
  }

  /* ── 5. Abdos : à la suite d'une séance sans barre (P2), sinon un jour sans tirage ── */
  for (const [w, wd] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
    const need = weekTarget('abdos', w) - countInWeek('abdos', w)
    const cands = wd
      .filter((d) => !blocked.has(d) && nextCode('abdos', d) && !cal.has(d, (e) => isPull(e) || e.kind === 'abdos') && cal.on(d).length < 2 && !cal.has(addDayKey(d, -1), (e) => e.kind === 'abdos') && !cal.has(addDayKey(d, 1), (e) => e.kind === 'abdos'))
      .filter((d) => cal.on(d).length > 0 || keepsRest(d))
      .map((d) => ({ day: d, cost: (cal.has(d, (e) => e.kind === 'street') ? 0 : cal.on(d).length ? 1 : 2) + liked(d, 'abdos') }))
    for (const d of pickDays(cands, need, notAdjacent)) {
      if (cal.on(d).length === 0 && !keepsRest(d)) continue
      const withP = cal.has(d, (e) => e.kind === 'street')
      place(mk('abdos', d, nextCode('abdos', d), withP ? `À la fin de ${cal.on(d).find(isStreet)?.code} : séance sans barre` : 'Jour sans tirage'))
    }
  }

  entries.sort((a, b) => a.day.localeCompare(b.day) || a.kind.localeCompare(b.kind))
  return { entries, notes, end }
}

/* ── Avertissements ─────────────────────────────────────────────────────── */

export interface PlanWarning {
  day: DayKey
  hard: boolean
  text: string
}

/** Les règles dures (rouge) et souples (jaune) enfreintes par un ensemble de séances. Jamais bloquant. */
export function planWarnings(events: PlanEvent[], from: DayKey, to: DayKey): PlanWarning[] {
  const cal = new Cal()
  for (const e of events) cal.add(e)
  const out: PlanWarning[] = []
  const add = (day: DayKey, hard: boolean, text: string) => out.push({ day, hard, text })
  for (let d = from; d <= to; d = addDayKey(d, 1)) {
    const p = (x: number, f: (e: PlanEvent) => boolean) => cal.has(addDayKey(d, x), f)
    if (p(0, isStreet) && p(-1, isStreet) && p(-2, isStreet)) add(d, true, '3 jours de street de suite : évite d’enchaîner')
    if (p(0, isRun) && p(-1, isRun)) add(d, true, 'Course 2 jours de suite')
    if (cal.on(d).length > 2) add(d, false, 'Plus de 2 séances ce jour-là')
    if (cal.on(d).filter(isHardWarn).length > 1) add(d, false, 'Plusieurs séances dures le même jour')
    if (p(0, (e) => e.kind === 'jambes') && p(1, isRun)) add(d, false, 'Jambes la veille d’une course')
    if (addDayKey(d, -6) >= from) {
      let rest = false
      for (let x = addDayKey(d, -6); x <= d; x = addDayKey(x, 1)) if (!cal.on(x).length) rest = true
      if (!rest) add(d, false, 'Aucun jour de repos complet sur 7 jours')
    }
  }
  return out
}
