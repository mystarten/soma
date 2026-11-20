import type { DayKey, Program, ProgramSession, ProgramWeek, Workout } from '../types'
import { addDayKey, dayDiff } from './time'
import { planCell } from './program'
import { socleOf, SOCLE_ORDER } from './rotation'

/* ──────────────────────────────────────────────────────────────────────────
   « Aujourd'hui » : la semaine du programme d'après la date, ce qui est prévu cette semaine pour chaque séance,
   et la séance à conseiller (avec ses garde-fous : 48 h entre deux tirages, 3 tirages maximum par semaine…).
   Les séances n'ont pas toutes la même date de départ (jambes et abdos ne commencent qu'à la semaine 6) :
   chacune lit sa propre semaine d'après ses dates.
   ────────────────────────────────────────────────────────────────────────── */

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']
const dm = (d: DayKey) => ({ d: Number(d.slice(8, 10)), m: Number(d.slice(5, 7)) - 1 })

/** « 16-22 nov » ou « 30 nov-6 déc ». */
export function weekLabel(start: DayKey): string {
  const end = addDayKey(start, 6)
  const a = dm(start)
  const b = dm(end)
  return a.m === b.m ? `${a.d}-${b.d} ${MONTHS[b.m]}` : `${a.d} ${MONTHS[a.m]}-${b.d} ${MONTHS[b.m]}`
}

/** Le lundi de la semaine 1 : la date choisie dans les réglages, sinon la plus ancienne date du programme. */
export function programStartDay(program: Pick<Program, 'sessions'>, override?: DayKey): DayKey | null {
  if (override) return override
  const starts = program.sessions.map((s) => s.weeks[0]?.startDay).filter((d): d is DayKey => !!d).sort()
  return starts[0] ?? null
}

/** Début (lundi) de la semaine d'indice `i` d'une séance, en tenant compte du décalage éventuel de la date de départ. */
export function sessionWeekStart(program: Pick<Program, 'sessions'>, session: ProgramSession, i: number, override?: DayKey): DayKey | null {
  const w = session.weeks[i]
  if (!w) return null
  const original = programStartDay(program)
  if (w.startDay) {
    if (!override || !original) return w.startDay
    return addDayKey(w.startDay, dayDiff(override, original))
  }
  return override ? addDayKey(override, 7 * i) : null
}

export interface SessionWeek {
  week: ProgramWeek
  index: number
  start: DayKey
  end: DayKey
}

/** La semaine de cette séance qui contient `day` (ou null si la séance n'a pas commencé ou est terminée). */
export function sessionWeekOn(program: Pick<Program, 'sessions'>, session: ProgramSession, day: DayKey, override?: DayKey): SessionWeek | null {
  for (let i = 0; i < session.weeks.length; i++) {
    const start = sessionWeekStart(program, session, i, override)
    if (!start) continue
    const end = addDayKey(start, 6)
    if (day >= start && day <= end) return { week: session.weeks[i], index: i, start, end }
  }
  return null
}

export interface WeekInfo {
  n: number
  total: number
  start: DayKey
  end: DayKey
  label: string
  light: boolean
  test: boolean
  state: 'before' | 'during' | 'after'
}

/** La semaine du programme à la date du jour. */
export function currentWeek(program: Pick<Program, 'sessions'>, today: DayKey, override?: DayKey): WeekInfo | null {
  const first = programStartDay(program, override)
  if (!first) return null
  const total = Math.max(...program.sessions.map((s) => s.weeks.length), 1)
  const raw = Math.floor(dayDiff(today, first) / 7) + 1
  const state = raw < 1 ? 'before' : raw > total ? 'after' : 'during'
  const n = Math.min(total, Math.max(1, raw))
  const start = addDayKey(first, 7 * (n - 1))
  let light = false
  let test = false
  for (const s of program.sessions) {
    const sw = sessionWeekOn(program, s, start, override)
    if (sw?.week.light) light = true
    if (sw?.week.test) test = true
  }
  return { n, total, start, end: addDayKey(start, 6), label: weekLabel(start), light, test, state }
}

/* ── Familles de séances ───────────────────────────────────────────────── */

export type Family = 'tirage' | 'poussee' | 'jambes' | 'abdos' | 'street' | 'course'

export const FAMILY_LABEL: Record<Family, string> = {
  tirage: 'tirage',
  poussee: 'poussée',
  jambes: 'jambes',
  abdos: 'abdos',
  street: 'street workout',
  course: 'course',
}

/** Tirage : tractions, rameur, corde, muscle-up (une séance mixte tractions + pompes compte comme du tirage). */
export function familyOf(session: Pick<ProgramSession, 'code' | 'title' | 'blocks'>): Family {
  const so = socleOf(session.code)
  if (so === 'jambes') return 'jambes'
  if (so === 'abdos') return 'abdos'
  if (so === 'course') return 'course'
  const text = `${session.title} ${session.blocks.map((b) => b.name).join(' ')}`.toLowerCase()
  if (/traction|tirage|rameur|corde|muscle|pull/.test(text)) return 'tirage'
  if (/pompe|dips|push|pouss/.test(text)) return 'poussee'
  return 'street'
}

/* ── Détail d'une séance pour une semaine ───────────────────────────────── */

export interface DetailBlock {
  name: string
  text: string
  restSec?: number
  note?: string
  test?: boolean
}

const cleanName = (n: string) => n.replace(/^[A-Z]\.\s*/, '').trim()
/** Une pyramide ou un EMOM, dit en clair. */
function readable(c: ReturnType<typeof planCell>, fallback: string): string {
  const em = c.sets.find((x) => x.emom)?.emom
  if (em) {
    const [a, b] = em.items
    return b ? `EMOM ${em.minutes} min : minutes impaires ${a.reps} ${(a.name ?? '').toLowerCase()}, minutes paires ${b.reps} ${(b.name ?? '').toLowerCase()}` : `EMOM ${em.minutes} min : ${a.reps} répétitions par minute`
  }
  const pairs = c.sets.filter((x) => x.hint === 'tractions' || x.hint === 'pompes' || x.label)
  if (pairs.length >= 4 && pairs.length === c.sets.length) {
    const firsts = c.sets.filter((_, i) => i % 2 === 0)
    const seconds = c.sets.filter((_, i) => i % 2 === 1)
    const n1 = (firsts[0]?.label ?? (firsts[0]?.hint === 'tractions' ? 'Tractions' : 'exercice 1')).toLowerCase()
    const n2 = (seconds[0]?.label ?? (seconds[0]?.hint === 'pompes' ? 'Pompes' : 'exercice 2')).toLowerCase()
    const ratio = firsts[0]?.reps ? Math.round((seconds[0]?.reps ?? 0) / firsts[0].reps) : 2
    return `Pyramide ${firsts.map((f) => f.reps).join('-')} : ${n1}, puis ${n2} (×${ratio}) sans repos entre les deux`
  }
  return fallback
}

/** Ce que contient la séance cette semaine : seulement les blocs qui ont quelque chose de prévu. */
export function sessionDetail(session: ProgramSession, wi: number): DetailBlock[] {
  const tours = session.blocks.find((b) => /^tours?$/i.test(b.name.trim()))
  const toursText = tours?.cells[wi]?.trim()
  const out: DetailBlock[] = []
  for (const b of session.blocks) {
    if (b === tours) continue
    const c = planCell(b, wi, Number(/(\d+)/.exec(toursText ?? '')?.[1]) || undefined)
    if (c.rest || (!c.sets.length && !c.test)) continue
    const rest = c.sets.find((s) => s.restSec !== undefined && s.restSec > 0)?.restSec ?? b.restSec
    const note = b.note?.replace(/repos\s+\d+:\d{2}\s*·?\s*/i, '').replace(/^\s*·\s*/, '').trim()
    out.push({
      name: cleanName(b.name),
      text: readable(c, toursText && /rameur/i.test(b.name) ? `${toursText} · ${c.text}` : c.text),
      restSec: c.sets.length > 1 ? rest : undefined,
      note: note || undefined,
      test: c.test || undefined,
    })
  }
  return out
}

/* ── Plan de la semaine ─────────────────────────────────────────────────── */

export interface PlanItem {
  code: string
  title: string
  family: Family
  /** Numéro de semaine de CETTE séance (jambes et abdos : 1 quand le programme est à la semaine 6). */
  weekN: number
  index: number
  label: string
  light: boolean
  test: boolean
  done: boolean
  detail: DetailBlock[]
}

export function weekPlan(program: Pick<Program, 'sessions'>, week: WeekInfo, done: Map<string, Set<number>>, override?: DayKey): PlanItem[] {
  const out: PlanItem[] = []
  for (const s of program.sessions) {
    const sw = sessionWeekOn(program, s, week.start, override)
    if (!sw) continue
    const detail = sessionDetail(s, sw.index)
    if (!detail.length) continue /* rien de prévu cette semaine : jamais proposée */
    out.push({
      code: s.code,
      title: s.title,
      family: familyOf(s),
      weekN: sw.week.n,
      index: sw.index,
      label: weekLabel(sw.start),
      light: !!sw.week.light,
      test: !!sw.week.test,
      done: done.get(s.code)?.has(sw.week.n) ?? false,
      detail,
    })
  }
  return out
}

/* ── Recommandation ─────────────────────────────────────────────────────── */

export const PULL_GAP_HOURS = 48
export const PULL_MAX_PER_WEEK = 3

export interface Recommendation {
  pick: PlanItem | null
  reason: string
  /** Séances écartées et pourquoi (pour l'expliquer). */
  excluded: { code: string; why: string }[]
  remaining: PlanItem[]
  doneThisWeek: Workout[]
  doneMinutes: number
}

function fmtAgo(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return 'il y a moins d’une heure'
  if (h < 48) return `il y a ${Math.round(h)} h`
  return `il y a ${Math.round(h / 24)} jours`
}

export function recommend(input: {
  program: Pick<Program, 'sessions'>
  workouts: Workout[]
  done: Map<string, Set<number>>
  week: WeekInfo
  nowMs: number
  override?: DayKey
}): Recommendation {
  const { program, week, nowMs } = input
  const plan = weekPlan(program, week, input.done, input.override)
  const live = input.workouts.filter((w) => !w.deleted && !w.backfill && !w.planned)
  const doneThisWeek = live.filter((w) => w.day >= week.start && w.day <= week.end)
  const doneMinutes = doneThisWeek.reduce((a, w) => a + w.durationMin, 0)
  const familyOfCode = (code: string): Family | null => {
    const s = program.sessions.find((x) => x.code === code)
    return s ? familyOf(s) : null
  }
  const lastOf = (fam: Family): Workout | null => {
    const ws = live.filter((w) => w.program?.some((r) => familyOfCode(r.code) === fam)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return ws[0] ?? null
  }
  const countThisWeek = (fam: Family) => doneThisWeek.reduce((a, w) => a + (w.program?.filter((r) => familyOfCode(r.code) === fam).length ?? 0), 0)

  const remaining = plan.filter((p) => !p.done)
  const excluded: { code: string; why: string }[] = []
  const lastPull = lastOf('tirage')
  const pullAge = lastPull ? nowMs - new Date(lastPull.startedAt).getTime() : Infinity
  const pullsDone = countThisWeek('tirage')

  const candidates = remaining.filter((p) => {
    if (p.family !== 'tirage') return true
    if (pullAge < PULL_GAP_HOURS * 3_600_000) {
      excluded.push({ code: p.code, why: `dernier tirage ${fmtAgo(pullAge)} (48 h minimum entre deux tirages)` })
      return false
    }
    if (pullsDone >= PULL_MAX_PER_WEEK) {
      excluded.push({ code: p.code, why: `${pullsDone} séances de tirage déjà faites cette semaine (maximum ${PULL_MAX_PER_WEEK})` })
      return false
    }
    return true
  })

  /* On préfère la famille la moins pratiquée cette semaine, puis celle qui n'a pas été faite depuis le plus longtemps. */
  const score = (p: PlanItem) => {
    const last = lastOf(p.family)
    return { n: countThisWeek(p.family), t: last ? new Date(last.startedAt).getTime() : 0, o: SOCLE_ORDER.indexOf(socleOf(p.code)) }
  }
  const sorted = [...candidates].sort((a, b) => {
    const A = score(a)
    const B = score(b)
    return A.n - B.n || A.t - B.t || A.o - B.o || plan.indexOf(a) - plan.indexOf(b)
  })
  const pick = sorted[0] ?? null

  let reason = ''
  if (pick) {
    const last = lastOf(pick.family)
    const n = countThisWeek(pick.family)
    const bits: string[] = []
    bits.push(last ? `Dernier ${FAMILY_LABEL[pick.family]} ${fmtAgo(nowMs - new Date(last.startedAt).getTime())}` : `Pas encore de ${FAMILY_LABEL[pick.family]} dans ton journal`)
    bits.push(n === 0 ? `aucun ${FAMILY_LABEL[pick.family]} cette semaine` : `${n} ${FAMILY_LABEL[pick.family]} déjà fait cette semaine`)
    reason = bits.join(' · ')
  } else if (!remaining.length && plan.length) reason = 'Tout ce qui est prévu cette semaine est fait.'
  else if (excluded.length) reason = `Rien à proposer sans enfreindre le repos : ${excluded.map((e) => `${e.code} (${e.why})`).join(' ; ')}.`
  else reason = 'Rien de prévu cette semaine.'
  return { pick, reason, excluded, remaining, doneThisWeek, doneMinutes }
}
