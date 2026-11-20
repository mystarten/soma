import type { DayKey, Workout } from '../types'
import { socleOf } from './rotation'

export type Category = 'street' | 'jambes' | 'abdos' | 'course' | 'natation' | 'velo' | 'cardio' | 'autre'

export const CATEGORY_LABEL: Record<Category, string> = {
  street: 'Street workout',
  jambes: 'Jambes',
  abdos: 'Abdos',
  course: 'Course à pied',
  natation: 'Natation',
  velo: 'Vélo',
  cardio: 'Cardio',
  autre: 'Autre',
}

export const CATEGORY_COLOR: Record<Category, string> = {
  street: '#35e3ff',
  jambes: '#9b7bff',
  abdos: '#ffc24b',
  course: '#41e08a',
  natation: '#6bb7ff',
  velo: '#27e0c0',
  cardio: '#27e0c0',
  autre: '#9fb6d6',
}

/** La catégorie d'une séance : celle du programme (street, jambes, abdos) ou son type (course, natation…). */
export function categoryOf(w: Pick<Workout, 'program' | 'kind' | 'cardio'>): Category {
  const code = w.program?.[0]?.code
  if (code) {
    const so = socleOf(code)
    if (so === 'jambes' || so === 'abdos' || so === 'course') return so
    return 'street'
  }
  if (w.kind === 'course') return 'course'
  if (w.kind === 'abdos') return 'abdos'
  if (w.kind === 'street') return 'street'
  if (w.kind === 'cardio') {
    const m = (w.cardio?.modality ?? '').toLowerCase()
    if (m.includes('nat')) return 'natation'
    if (m.includes('velo') || m.includes('vélo')) return 'velo'
    return 'cardio'
  }
  return 'autre'
}

/** Les séances par jour, sans les coches de rattrapage ni les séances prévues. */
export function workoutsByDay(workouts: Workout[]): Map<DayKey, Workout[]> {
  const m = new Map<DayKey, Workout[]>()
  for (const w of workouts) {
    if (w.deleted || w.backfill || w.planned) continue
    m.set(w.day, [...(m.get(w.day) ?? []), w].sort((a, b) => a.startedAt.localeCompare(b.startedAt)))
  }
  return m
}

/** Les séances « prévues » (placées dans le calendrier, pas encore faites), par jour. */
export function plannedByDay(workouts: Workout[]): Map<DayKey, Workout[]> {
  const m = new Map<DayKey, Workout[]>()
  for (const w of workouts) {
    if (w.deleted || w.backfill || !w.planned || w.plan?.status === 'sautee') continue
    m.set(w.day, [...(m.get(w.day) ?? []), w].sort((a, b) => a.startedAt.localeCompare(b.startedAt)))
  }
  return m
}

/** Les 42 cases d'un mois (6 semaines), semaine commençant le lundi ou le dimanche. */
export function monthGrid(year: number, month: number, weekStartsOn: 0 | 1): { day: DayKey; inMonth: boolean }[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() - weekStartsOn + 7) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { day, inMonth: d.getMonth() === month }
  })
}

export interface ExtraWorkoutInput {
  day: DayKey
  type: 'course' | 'natation' | 'velo' | 'autre'
  name: string
  distance?: number
  durationMin?: number
  notes?: string
  /** Effort ressenti sur 10 et douleur au tibia (course). */
  rpe?: number
  shinPainBefore?: number
  shinPain?: number
}

/** Une séance hors programme (course, natation, vélo, autre) : distance en km pour la course et le vélo, en mètres pour la natation. */
export function buildExtraWorkout(i: ExtraWorkoutInput, id: string, nowIso: string): Workout {
  const startedAt = new Date(`${i.day}T12:00:00`).toISOString()
  const base = { id, day: i.day, startedAt, durationMin: Math.max(1, Math.round(i.durationMin ?? 30)), notes: i.notes?.trim() || undefined, rpe: i.rpe, source: 'manual' as const, updatedAt: nowIso }
  const title = i.name.trim() || CATEGORY_LABEL[i.type]
  if (i.type === 'course') {
    const distanceM = i.distance ? Math.round(i.distance * 1000) : undefined
    return { ...base, kind: 'course', title, run: { runType: 'footing', distanceM, durationSec: base.durationMin * 60, shinPainBefore: i.shinPainBefore, shinPain: i.shinPain } }
  }
  if (i.type === 'natation') return { ...base, kind: 'cardio', title, cardio: { modality: 'natation', distanceM: i.distance ? Math.round(i.distance) : undefined } }
  if (i.type === 'velo') return { ...base, kind: 'cardio', title, cardio: { modality: 'velo', distanceM: i.distance ? Math.round(i.distance * 1000) : undefined } }
  return { ...base, kind: 'custom', title }
}
