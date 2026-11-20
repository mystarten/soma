import type { DayKey, Program, Settings, Workout } from '../types'
import { categoryOf } from './calendar'
import { buildPlan, planSettings, planWarnings, type PlanEntry, type PlanEvent, type PlanKind, type PlanWarning } from './plan'
import { sessionWeekOn } from './todayPlan'
import { isPlannedWeek } from './program'
import { addDayKey as addDays } from './time'

/* Le plan est enregistré dans le journal sous forme de séances « prévues » (donc synchronisé et sauvegardé comme le reste) :
   plan.auto = proposée par l'algorithme ; plan.locked = épinglée ; une séance posée à la main n'est jamais déplacée par l'algorithme. */

const KINDS: Partial<Record<ReturnType<typeof categoryOf>, PlanKind>> = { street: 'street', jambes: 'jambes', abdos: 'abdos', course: 'course', natation: 'natation', velo: 'velo' }

export const planKindOf = (w: Pick<Workout, 'program' | 'kind' | 'cardio'>): PlanKind | undefined => KINDS[categoryOf(w)]

/** Les séances déjà faites : elles pèsent sur le rythme et la rotation. */
export function historyEvents(workouts: Workout[]): PlanEvent[] {
  const out: PlanEvent[] = []
  for (const w of workouts) {
    if (w.deleted || w.backfill || w.planned) continue
    const kind = planKindOf(w)
    if (kind) out.push({ day: w.day, kind, code: w.program?.[0]?.code })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day))
}

const live = (w: Workout) => !!w.planned && !w.deleted && w.plan?.status !== 'sautee'

/** Une séance prévue que l'algorithme ne déplacera pas : posée à la main ou épinglée. */
export const isLocked = (w: Workout): boolean => live(w) && (!w.plan?.auto || !!w.plan.locked)

export function lockedEntries(workouts: Workout[], today: DayKey): PlanEntry[] {
  const out: PlanEntry[] = []
  for (const w of workouts) {
    if (!isLocked(w) || w.day < today) continue
    const kind = planKindOf(w)
    if (!kind) continue
    out.push({ id: w.id, day: w.day, kind, code: w.program?.[0]?.code, week: w.program?.[0]?.week, locked: true, reason: w.plan?.reason ?? 'Posée par toi', title: w.title ?? '', durationMin: w.durationMin })
  }
  return out
}

/** Les séances proposées par l'algorithme et pas épinglées. */
export const storedAuto = (workouts: Workout[]): Workout[] => workouts.filter((w) => live(w) && w.plan?.auto && !w.plan.locked)

/** Une proposition de l'algorithme, enregistrée comme séance prévue. */
export function entryToWorkout(e: PlanEntry, nowIso: string): Workout {
  const base = { id: e.id, day: e.day, startedAt: new Date(`${e.day}T12:00:00`).toISOString(), durationMin: e.durationMin, planned: true, source: 'manual' as const, plan: { auto: true, status: 'prevue' as const, reason: e.reason }, updatedAt: nowIso }
  if (e.kind === 'natation') return { ...base, kind: 'cardio', title: 'Natation', cardio: { modality: 'natation' } }
  if (e.kind === 'velo') return { ...base, kind: 'cardio', title: 'VTT', cardio: { modality: 'velo' } }
  const kind = e.kind === 'course' ? 'course' : e.kind === 'abdos' ? 'abdos' : 'street'
  return { ...base, kind, title: `${e.code} · S${e.week}`, program: [{ code: e.code!, week: e.week! }] }
}

export interface PlanChange {
  type: 'add' | 'remove' | 'move'
  label: string
  from?: DayKey
  to?: DayKey
}

export interface PlanDiff {
  add: PlanEntry[]
  remove: Workout[]
  changes: PlanChange[]
}

const labelOf = (code: string | undefined, kind: PlanKind) => code ?? (kind === 'natation' ? 'Natation' : kind === 'velo' ? 'VTT' : kind)

/** Ce qui change entre le plan enregistré (de `today` à `last`) et le plan recalculé. */
export function diffPlan(stored: Workout[], computed: PlanEntry[], today: DayKey, last: DayKey): PlanDiff {
  const inScope = stored.filter((w) => w.day >= today && w.day <= last)
  const byId = new Map(inScope.map((w) => [w.id, w]))
  const ids = new Set(computed.map((e) => e.id))
  const add = computed.filter((e) => {
    const w = byId.get(e.id)
    return !w || w.plan?.reason !== e.reason || w.program?.[0]?.week !== e.week
  })
  const remove = inScope.filter((w) => !ids.has(w.id))
  const changes: PlanChange[] = []
  const gone = [...remove]
  for (const e of computed.filter((c) => !byId.has(c.id))) {
    const i = gone.findIndex((w) => planKindOf(w) === e.kind && (w.program?.[0]?.code ?? '') === (e.code ?? ''))
    if (i >= 0) {
      changes.push({ type: 'move', label: labelOf(e.code, e.kind), from: gone[i].day, to: e.day })
      gone.splice(i, 1)
    } else changes.push({ type: 'add', label: labelOf(e.code, e.kind), to: e.day })
  }
  for (const w of gone) {
    const kind = planKindOf(w)
    changes.push({ type: 'remove', label: labelOf(w.program?.[0]?.code, kind ?? 'street'), from: w.day })
  }
  return { add, remove, changes: changes.sort((a, b) => (a.to ?? a.from ?? '').localeCompare(b.to ?? b.from ?? '')) }
}

/** Séances proposées dont le jour est passé sans qu'elles aient été faites : marquées « sautées » (jamais rattrapées avec d'anciennes charges). */
export function expiredAuto(workouts: Workout[], today: DayKey): Workout[] {
  return storedAuto(workouts).filter((w) => w.day < today)
}

export const programRef = (p: Pick<Program, 'sessions'>, code: string) => p.sessions.find((s) => s.code === code)

/* ── Décaler, jour indisponible ─────────────────────────────────────────── */


export interface PlanContext {
  program: Pick<Program, 'sessions'>
  today: DayKey
  days: number
  settings: Settings
  workouts: Workout[]
  blocked: DayKey[]
}

export interface PlanPreview {
  diff: PlanDiff
  /** La séance déplacée (déjà verrouillée à son nouveau jour). */
  moved?: Workout
  /** Séances posées à la main qui étaient sur un jour devenu indisponible : elles sont retirées puis replacées par l'algorithme. */
  dropped: Workout[]
  warnings: PlanWarning[]
  headline: PlanChange[]
  /** Remarques de l'algorithme (ex. sorties de course non placées). */
  notes: string[]
  /** Dernier jour du plan (fin du programme). */
  end: DayKey
}

const lastDayOf = (ctx: PlanContext, end: DayKey) => (addDays(ctx.today, ctx.days - 1) < end ? addDays(ctx.today, ctx.days - 1) : end)

function compute(ctx: PlanContext, workouts: Workout[], blocked: DayKey[], dropped: Workout[]): { diff: PlanDiff; warnings: PlanWarning[]; notes: string[]; end: DayKey } {
  const ps = planSettings(ctx.settings, ctx.program as Program)
  const history = historyEvents(workouts)
  const droppedIds = new Set(dropped.map((w) => w.id))
  const locked = lockedEntries(workouts.filter((w) => !droppedIds.has(w.id)), ctx.today)
  const plan = buildPlan({ program: ctx.program, today: ctx.today, days: ctx.days, override: ctx.settings.programStart, settings: ps, history, locked, blocked, prefer: storedAuto(workouts).flatMap((w) => { const k = planKindOf(w); return k ? [{ day: w.day, kind: k, code: w.program?.[0]?.code }] : [] }) })
  const last = lastDayOf(ctx, plan.end)
  const diff = diffPlan([...storedAuto(workouts), ...dropped], plan.entries, ctx.today, last)
  const events: PlanEvent[] = [...history, ...locked, ...plan.entries]
  return { diff, warnings: planWarnings(events, addDays(ctx.today, -8), last).filter((w) => w.day >= ctx.today), notes: plan.notes, end: plan.end }
}

/** Le plan recalculé tel qu'il serait sans rien changer (pour « Mettre à jour »). */
export function previewRecalc(ctx: PlanContext): PlanPreview {
  const { diff, warnings, notes, end } = compute(ctx, ctx.workouts, ctx.blocked, [])
  return { diff, dropped: [], warnings, headline: [], notes, end }
}

/** Déplace une séance prévue à une autre date : elle est verrouillée là, et l'algorithme recalcule tout le reste autour. */
export function previewMove(ctx: PlanContext, id: string, toDay: DayKey): PlanPreview | { error: string } {
  const w = ctx.workouts.find((x) => x.id === id && x.planned && !x.deleted)
  if (!w) return { error: 'Séance introuvable.' }
  const end = lastDayOf({ ...ctx, days: 400 }, planEndOf(ctx))
  if (toDay < ctx.today) return { error: 'Choisis un jour à partir d’aujourd’hui.' }
  if (toDay > end) return { error: `Le plan s’arrête à la fin du programme (${end.slice(8)}/${end.slice(5, 7)}).` }
  const ref = w.program?.[0]
  let program = w.program
  let title = w.title
  if (ref) {
    const s = ctx.program.sessions.find((x) => x.code === ref.code)
    const sw = s ? sessionWeekOn(ctx.program, s, toDay, ctx.settings.programStart) : null
    if (!s || !sw || !isPlannedWeek(s, sw.week)) return { error: `${ref.code} n’a rien de prévu ce jour-là (aucune semaine du programme ne le contient).` }
    program = [{ code: ref.code, week: sw.week.n }]
    title = (w.title ?? '').replace(new RegExp(`${ref.code} · S${ref.week}`), `${ref.code} · S${sw.week.n}`)
  }
  const moved: Workout = {
    ...w,
    day: toDay,
    startedAt: new Date(`${toDay}T12:00:00`).toISOString(),
    program,
    title,
    plan: { ...w.plan, locked: true, status: 'decalee', originalDay: w.plan?.originalDay ?? w.day },
  }
  const next = ctx.workouts.map((x) => (x.id === id ? moved : x))
  const { diff, warnings, notes, end: planEnd } = compute(ctx, next, ctx.blocked, [])
  const label = labelOf(program?.[0]?.code, planKindOf(w) ?? 'street')
  return { diff, moved, dropped: [], warnings: warnings.filter((x) => Math.abs(dayDiffAbs(x.day, toDay)) <= 1), headline: [{ type: 'move', label, from: w.day, to: toDay }], notes, end: planEnd }
}

/** Marque un jour indisponible : l'algorithme n'y suggère plus rien. Tes propres séances ce jour-là restent (à toi de les déplacer). */
export function previewBlock(ctx: PlanContext, day: DayKey): PlanPreview {
  const blocked = [...new Set([...ctx.blocked, day])]
  const dropped: Workout[] = []
  const { diff, warnings, notes, end } = compute(ctx, ctx.workouts, blocked, dropped)
  return { diff, dropped, warnings, headline: [], notes, end }
}

function planEndOf(ctx: PlanContext): DayKey {
  return buildPlan({ program: ctx.program, today: ctx.today, days: 1, override: ctx.settings.programStart, settings: planSettings(ctx.settings, ctx.program as Program), history: [], locked: [] }).end
}
const dayDiffAbs = (a: DayKey, b: DayKey) => Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000)

/** Les suggestions de l'algorithme (rien n'est enregistré) : à toi de choisir celles que tu ajoutes. */
export function suggestions(ctx: PlanContext): { entries: PlanEntry[]; notes: string[]; end: DayKey } {
  const history = historyEvents(ctx.workouts)
  const locked = lockedEntries(ctx.workouts, ctx.today)
  const r = buildPlan({ program: ctx.program, today: ctx.today, days: ctx.days, override: ctx.settings.programStart, settings: planSettings(ctx.settings, ctx.program as Program), history, locked, blocked: ctx.blocked })
  return { entries: r.entries, notes: r.notes, end: r.end }
}

/** Une suggestion que tu choisis d'ajouter : elle devient une séance prévue à toi (aucun recalcul ne la déplacera). */
export function entryToPlaced(e: PlanEntry, id: string, nowIso: string): Workout {
  const w = entryToWorkout(e, nowIso)
  return { ...w, id, plan: { reason: e.reason, status: 'prevue' } }
}
