import type {
  SetEntry,
  TemplateItem,
  Workout,
  WorkoutTemplate,
} from '../types'
import { groupByExercise } from './sets'

/* ──────────────────────────────────────────────────────────────────────────
   Séances mémorisées : chaque séance enregistrée (avec un titre) est gardée
   pour pouvoir être refaite en un clic, puis modifiée avant de valider.
   Fonctions pures, sans React ni base de données.
   ────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_REST_SEC = 90

export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export function findTemplateByName(list: WorkoutTemplate[], name: string): WorkoutTemplate | undefined {
  const n = normName(name)
  return n ? list.find((t) => normName(t.name) === n) : undefined
}

const sameSet = (a: SetEntry, b: SetEntry) =>
  a.reps === b.reps && a.loadKg === b.loadKg && a.holdSec === b.holdSec && a.restSec === b.restSec

/** Une séance doit être mémorisée si elle est faite à la main et porte un titre. */
export function isRememberable(w: Workout): boolean {
  return !w.deleted && !w.planned && w.source === 'manual' && !!w.title?.trim()
}

export function workoutToTemplate(
  w: Workout,
  existing: WorkoutTemplate | undefined,
  newId: () => string,
): WorkoutTemplate | null {
  const name = w.title?.trim()
  if (!name) return null
  const items: TemplateItem[] = groupByExercise(w.sets ?? []).map((g) => {
    const first = g.sets[0]
    const uniform = g.sets.every((s) => sameSet(s, first))
    return {
      exerciseId: g.exerciseId,
      sets: g.sets.length,
      reps: first.reps,
      loadKg: first.loadKg,
      holdSec: first.holdSec,
      restSec: first.restSec,
      setList: uniform
        ? undefined
        : g.sets.map((s) => ({
            reps: s.reps,
            loadKg: s.loadKg,
            holdSec: s.holdSec,
            restSec: s.restSec,
            failure: s.failure,
          })),
    }
  })
  return {
    id: existing?.id ?? newId(),
    name,
    kind: w.kind,
    items,
    customTypeId: w.customTypeId,
    durationMin: w.durationMin,
    rpe: w.rpe,
    run: w.run ? structuredClone(w.run) : undefined,
    cardio: w.cardio ? structuredClone(w.cardio) : undefined,
    lastDoneAt: w.startedAt,
    auto: existing?.auto ?? true,
    updatedAt: new Date().toISOString(),
  }
}

/** Les séries d'un exercice mémorisé, avec de nouveaux identifiants. */
export function templateItemSets(item: TemplateItem, makeId: () => string): SetEntry[] {
  if (item.setList?.length === item.sets) {
    return item.setList.map((s) => ({
      id: makeId(),
      exerciseId: item.exerciseId,
      reps: s.reps,
      loadKg: s.loadKg,
      holdSec: s.holdSec,
      restSec: s.restSec ?? DEFAULT_REST_SEC,
      failure: s.failure,
    }))
  }
  return Array.from({ length: Math.max(1, item.sets) }, () => ({
    id: makeId(),
    exerciseId: item.exerciseId,
    reps: item.reps,
    loadKg: item.loadKg,
    holdSec: item.holdSec,
    restSec: item.restSec ?? DEFAULT_REST_SEC,
  }))
}

/** Une nouvelle séance prête à être modifiée puis enregistrée. */
export function workoutFromTemplate(
  tpl: WorkoutTemplate,
  base: { id: string; day: string; startedAt: string },
  makeId: () => string,
): Workout {
  return {
    id: base.id,
    day: base.day,
    startedAt: base.startedAt,
    durationMin: tpl.durationMin ?? 45,
    kind: tpl.kind,
    customTypeId: tpl.customTypeId,
    title: tpl.name,
    rpe: tpl.rpe ?? 7,
    feeling: 3,
    sets: tpl.items.flatMap((i) => templateItemSets(i, makeId)),
    run: tpl.run ? structuredClone(tpl.run) : undefined,
    cardio: tpl.cardio ? structuredClone(tpl.cardio) : undefined,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  }
}

/** Plus récentes d'abord, puis par nom. */
export function sortTemplates(list: WorkoutTemplate[]): WorkoutTemplate[] {
  return [...list].sort(
    (a, b) => (b.lastDoneAt ?? '').localeCompare(a.lastDoneAt ?? '') || a.name.localeCompare(b.name),
  )
}
