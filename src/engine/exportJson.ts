import type { ExerciseDef, Program, SetEntry, Workout } from '../types'
import { programToJson, PROGRAM_FORMAT_DOC } from './programJson'
import { programDone } from './program'

/* Export du suivi : programme, avancement, séances et notes, au format JSON lisible par une IA. */

const KIND: Record<string, string> = { street: 'street workout', muscu: 'musculation', course: 'course à pied', cardio: 'cardio', abdos: 'abdos', mobilite: 'mobilité', custom: 'autre' }

export function buildTrackingExport(input: { program: Program | null; workouts: Workout[]; exercises: ExerciseDef[]; now?: string }) {
  const { program, workouts, exercises } = input
  const name = (s: SetEntry) => s.label ?? exercises.find((e) => e.id === s.exerciseId)?.name ?? s.exerciseId
  const done = programDone(workouts)
  const progress = program
    ? Object.fromEntries(
        program.sessions.map((s) => {
          const d = [...(done.get(s.code) ?? [])].sort((a, b) => a - b)
          const next = s.weeks.map((w) => w.n).find((n) => !d.includes(n)) ?? null
          return [s.code, { title: s.title, done_weeks: d, next_week: next }]
        }),
      )
    : {}
  const sessions = workouts
    .filter((w) => !w.deleted && !w.backfill && !w.planned)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((w) => ({
      date: w.day,
      title: w.title ?? KIND[w.kind] ?? w.kind,
      type: KIND[w.kind] ?? w.kind,
      duration_min: w.durationMin,
      ...(w.rpe ? { rpe: w.rpe } : {}),
      ...(w.run?.distanceM ? { distance_m: w.run.distanceM } : w.cardio?.distanceM ? { distance_m: w.cardio.distanceM } : {}),
      ...(w.cardio?.modality ? { modality: w.cardio.modality } : {}),
      ...(w.program?.length ? { programme: w.program.map((r) => `${r.code} S${r.week}`) } : {}),
      ...(w.notes?.trim() ? { notes: w.notes.trim() } : {}),
      ...(w.sets?.length
        ? { sets: w.sets.map((s) => ({ exercise: name(s), ...(s.reps ? { reps: s.reps } : {}), ...(s.holdSec ? { hold_sec: s.holdSec } : {}), ...(s.loadKg ? { load_kg: s.loadKg } : {}), ...(s.distanceM ? { distance_m: s.distanceM } : {}), ...(s.note ? { note: s.note } : {}) })) }
        : {}),
    }))
  return {
    format: 'soma-suivi',
    version: 1,
    exported_at: input.now ?? new Date().toISOString(),
    program: program ? programToJson(program) : null,
    progress,
    sessions,
  }
}

export const AI_COACH_INTRO = `Tu es mon coach d'entraînement. Voici mon programme, mon avancement (semaines faites par séance) et l'historique de mes séances avec mes notes (difficulté, séries non faites, ressenti).

Ta mission :
1. Lis mes notes et mes résultats : dis-moi ce qui est trop facile, trop dur ou à ajuster (répétitions, charge, repos).
2. Pose-moi des questions si une information te manque pour bien me conseiller.
3. Quand je te le demande, propose une version modifiée du programme : réponds alors avec le programme COMPLET au format JSON "soma-programme" décrit ci-dessous, que je pourrai importer directement dans l'application.

`

/** Tout ce qu'il faut coller dans une conversation avec une IA : consignes, format, puis le suivi. */
export function buildAiContext(tracking: unknown): string {
  return `${AI_COACH_INTRO}=== FORMAT DU PROGRAMME ===\n${PROGRAM_FORMAT_DOC}\n\n=== MON SUIVI (JSON) ===\n${JSON.stringify(tracking, null, 2)}\n`
}
