import type { DayKey, Program, Workout } from '../types'
import { categoryOf } from './calendar'
import type { PlanEntry, PlanEvent, PlanKind } from './plan'

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
