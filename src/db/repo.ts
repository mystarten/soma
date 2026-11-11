import type {
  CheckIn,
  CustomMetric,
  Deadline,
  ExerciseDef,
  Goal,
  KnowledgeNote,
  Settings,
  SyncTable,
  Task,
  WhoopImport,
  Workout,
  WorkoutTemplate,
  WorkoutTypeDef,
} from '../types'
import { db, defaultSettings, nowIso, uid, withSettingsDefaults } from './db'
import { findTemplateByName, isRememberable, workoutToTemplate } from '../engine/templates'

/* ──────────────────────────────────────────────────────────────────────────
   Écritures : toujours dans Dexie d'abord, puis mise en file pour Supabase.
   Conflit : dernière modification gagne (horodatage par ligne).
   ────────────────────────────────────────────────────────────────────────── */

async function enqueue(table: SyncTable, rowId: string, payload: unknown, op: 'upsert' | 'delete') {
  try {
    await db.syncQueue.add({ table, rowId, payload, op, updatedAt: nowIso() })
  } catch {
    /* La file de sync ne doit jamais bloquer une écriture locale. */
  }
}

const stamp = <T extends { updatedAt: string }>(row: T): T => ({ ...row, updatedAt: nowIso() })

export async function saveCheckIn(row: CheckIn) {
  const next = stamp({ ...row, id: row.day })
  await db.checkins.put(next)
  await enqueue('checkins', next.id, next, 'upsert')
  return next
}

export async function deleteCheckIn(day: string) {
  const prev = await db.checkins.get(day)
  if (!prev) return
  const next = stamp({ ...prev, deleted: true })
  await db.checkins.put(next)
  await enqueue('checkins', day, next, 'delete')
}

export async function saveWorkout(row: Workout) {
  const next = stamp(row)
  await db.workouts.put(next)
  await enqueue('workouts', next.id, next, 'upsert')
  return next
}

export async function saveWorkouts(rows: Workout[]) {
  const next = rows.map(stamp)
  await db.workouts.bulkPut(next)
  for (const r of next) await enqueue('workouts', r.id, r, 'upsert')
  return next
}

export async function saveCheckIns(rows: CheckIn[]) {
  const next = rows.map((r) => stamp({ ...r, id: r.day }))
  await db.checkins.bulkPut(next)
  for (const r of next) await enqueue('checkins', r.id, r, 'upsert')
  return next
}

export async function deleteWorkout(id: string) {
  const prev = await db.workouts.get(id)
  if (!prev) return
  const next = stamp({ ...prev, deleted: true })
  await db.workouts.put(next)
  await enqueue('workouts', id, next, 'delete')
}

export async function saveExercise(row: ExerciseDef) {
  const next = stamp(row)
  await db.exercises.put(next)
  await enqueue('exercises', next.id, next, 'upsert')
  return next
}

export async function saveTemplate(row: WorkoutTemplate) {
  const next = stamp(row)
  await db.templates.put(next)
  await enqueue('templates', next.id, next, 'upsert')
  return next
}

/** Mémorise une séance faite à la main pour pouvoir la refaire en un clic. */
export async function rememberWorkout(w: Workout) {
  if (!isRememberable(w)) return null
  const existing = findTemplateByName(await db.templates.toArray(), w.title ?? '')
  /* On ne remplace pas une séance mémorisée par une plus ancienne. */
  if (existing?.lastDoneAt && existing.lastDoneAt > w.startedAt) return existing
  const tpl = workoutToTemplate(w, existing, () => uid('tpl'))
  return tpl ? saveTemplate(tpl) : null
}

/** Une seule fois : mémorise les séances déjà saisies (les plus récentes l'emportent). */
export async function backfillTemplates() {
  if ((await db.meta.get('tpl_backfill_v1'))?.value) return
  const all = (await db.workouts.toArray())
    .filter(isRememberable)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  /* Ta vraie séance remplace un modèle de départ du même nom (« Pull », « Push »…). */
  for (const w of all) await rememberWorkout(w)
  await db.meta.put({ key: 'tpl_backfill_v1', value: new Date().toISOString() })
}

export async function deleteTemplate(id: string) {
  await db.templates.delete(id)
  await enqueue('templates', id, null, 'delete')
}

export async function saveWorkoutType(row: WorkoutTypeDef) {
  const next = stamp(row)
  await db.workoutTypes.put(next)
  await enqueue('workoutTypes', next.id, next, 'upsert')
  return next
}

export async function saveGoal(row: Goal) {
  const next = stamp(row)
  await db.goals.put(next)
  await enqueue('goals', next.id, next, 'upsert')
  return next
}

export async function deleteGoal(id: string) {
  const prev = await db.goals.get(id)
  if (!prev) return
  const next = stamp({ ...prev, deleted: true })
  await db.goals.put(next)
  await enqueue('goals', id, next, 'delete')
}

export async function saveMetric(row: CustomMetric) {
  const next = stamp(row)
  await db.metrics.put(next)
  await enqueue('metrics', next.id, next, 'upsert')
  return next
}

export async function deleteMetric(id: string) {
  await db.metrics.delete(id)
  await enqueue('metrics', id, null, 'delete')
}

/** Lecture seule : ne crée jamais de ligne (utilisable dans une transaction `r`). */
export async function readSettings(): Promise<Settings> {
  return withSettingsDefaults(await db.settings.get('settings'))
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  if (s) return withSettingsDefaults(s)
  const fresh = defaultSettings()
  await db.settings.put(fresh)
  return fresh
}

export async function saveSettings(patch: Partial<Settings>) {
  const current = await getSettings()
  const next = stamp({ ...current, ...patch, id: 'settings' as const })
  await db.settings.put(next)
  await enqueue('settings', 'settings', next, 'upsert')
  return next
}

export async function saveTask(row: Task) {
  const next = stamp(row)
  await db.tasks.put(next)
  await enqueue('tasks', next.id, next, 'upsert')
  return next
}

export async function deleteTask(id: string) {
  const prev = await db.tasks.get(id)
  if (!prev) return
  const next = stamp({ ...prev, deleted: true })
  await db.tasks.put(next)
  await enqueue('tasks', id, next, 'delete')
}

export async function saveDeadline(row: Deadline) {
  const next = stamp(row)
  await db.deadlines.put(next)
  await enqueue('deadlines', next.id, next, 'upsert')
  return next
}

export async function deleteDeadline(id: string) {
  const prev = await db.deadlines.get(id)
  if (!prev) return
  const next = stamp({ ...prev, deleted: true })
  await db.deadlines.put(next)
  await enqueue('deadlines', id, next, 'delete')
}

export async function saveNote(row: KnowledgeNote) {
  const next = stamp(row)
  await db.notes.put(next)
  await enqueue('notes', next.id, next, 'upsert')
  return next
}

export async function saveNotes(rows: KnowledgeNote[]) {
  const next = rows.map(stamp)
  await db.notes.bulkPut(next)
  for (const r of next) await enqueue('notes', r.id, r, 'upsert')
  return next
}

export async function deleteNote(id: string) {
  const prev = await db.notes.get(id)
  if (!prev) return
  const next = stamp({ ...prev, deleted: true })
  await db.notes.put(next)
  await enqueue('notes', id, next, 'delete')
}

export async function recordImport(row: WhoopImport) {
  await db.imports.put(row)
}

/* ── Export / import ─────────────────────────────────────────────────── */

export interface SomaBackup {
  app: 'soma'
  version: 2
  exportedAt: string
  checkins: CheckIn[]
  workouts: Workout[]
  exercises: ExerciseDef[]
  templates: WorkoutTemplate[]
  workoutTypes: WorkoutTypeDef[]
  goals: Goal[]
  metrics: CustomMetric[]
  settings: Settings
  tasks?: Task[]
  deadlines?: Deadline[]
  notes?: KnowledgeNote[]
}

export async function exportBackup(): Promise<SomaBackup> {
  const [checkins, workouts, exercises, templates, workoutTypes, goals, metrics, settings, tasks, deadlines, notes] =
    await Promise.all([
      db.checkins.toArray(),
      db.workouts.toArray(),
      db.exercises.toArray(),
      db.templates.toArray(),
      db.workoutTypes.toArray(),
      db.goals.toArray(),
      db.metrics.toArray(),
      getSettings(),
      db.tasks.toArray(),
      db.deadlines.toArray(),
      db.notes.toArray(),
    ])
  return {
    app: 'soma',
    version: 2,
    exportedAt: nowIso(),
    checkins,
    workouts,
    exercises,
    templates,
    workoutTypes,
    goals,
    metrics,
    settings,
    tasks,
    deadlines,
    notes,
  }
}

export async function importBackup(data: unknown, mode: 'merge' | 'replace' = 'merge') {
  const b = data as Partial<SomaBackup>
  if (!b || b.app !== 'soma') throw new Error('Fichier non reconnu : ce n’est pas une sauvegarde Soma.')
  if (mode === 'replace') await wipeData()
  await db.transaction(
    'rw',
    [
      db.checkins,
      db.workouts,
      db.exercises,
      db.templates,
      db.workoutTypes,
      db.goals,
      db.metrics,
      db.settings,
      db.tasks,
      db.deadlines,
      db.notes,
    ],
    async () => {
      if (b.checkins?.length) await db.checkins.bulkPut(b.checkins.map((c) => ({ ...c, id: c.day })))
      if (b.workouts?.length) await db.workouts.bulkPut(b.workouts)
      if (b.exercises?.length) await db.exercises.bulkPut(b.exercises)
      if (b.templates?.length) await db.templates.bulkPut(b.templates)
      if (b.workoutTypes?.length) await db.workoutTypes.bulkPut(b.workoutTypes)
      if (b.goals?.length) await db.goals.bulkPut(b.goals)
      if (b.metrics?.length) await db.metrics.bulkPut(b.metrics)
      if (b.settings) await db.settings.put({ ...b.settings, id: 'settings' })
      if (b.tasks?.length) await db.tasks.bulkPut(b.tasks)
      if (b.deadlines?.length) await db.deadlines.bulkPut(b.deadlines)
      if (b.notes?.length) await db.notes.bulkPut(b.notes)
    },
  )
  return {
    checkins: b.checkins?.length ?? 0,
    workouts: b.workouts?.length ?? 0,
  }
}

/** CSV des check-ins quotidiens. */
export function checkinsToCsv(rows: CheckIn[], metrics: CustomMetric[]): string {
  const head = [
    'jour',
    'recuperation_pct',
    'sommeil_h',
    'sommeil_qualite_pct',
    'coucher',
    'lever',
    'reveils',
    'profond_min',
    'rem_min',
    'efficacite_pct',
    'fc_repos',
    'hrv',
    'poids_kg',
    'humeur',
    'energie',
    'stress',
    'hydratation_l',
    'notes',
    'source',
    ...metrics.map((m) => `metrique_${m.name}`),
  ]
  const lines = [head.join(',')]
  for (const c of rows) {
    if (c.deleted) continue
    const vals = [
      c.day,
      c.recovery ?? '',
      c.sleep?.hours ?? '',
      c.sleep?.quality ?? '',
      c.sleep?.bedtime ?? '',
      c.sleep?.wakeTime ?? '',
      c.sleep?.awakenings ?? '',
      c.sleep?.deepMin ?? '',
      c.sleep?.remMin ?? '',
      c.sleep?.efficiency ?? '',
      c.restingHr ?? '',
      c.hrv ?? '',
      c.weightKg ?? '',
      c.mood ?? '',
      c.energy ?? '',
      c.stress ?? '',
      c.hydrationL ?? '',
      (c.notes ?? '').replace(/[\n\r,";]/g, ' '),
      c.source,
      ...metrics.map((m) => c.custom?.[m.id] ?? ''),
    ]
    lines.push(vals.join(','))
  }
  return lines.join('\n')
}

/** CSV des séances (une ligne par série, ou une ligne par séance sans détail). */
export function workoutsToCsv(rows: Workout[], exercises: ExerciseDef[]): string {
  const head = [
    'jour',
    'debut',
    'type',
    'titre',
    'duree_min',
    'rpe',
    'exercice',
    'reps',
    'lest_kg',
    'tenue_s',
    'repos_s',
    'echec',
    'distance_m',
    'denivele_m',
    'fc_moy',
    'fc_max',
    'strain_whoop',
    'source',
    'notes',
  ]
  const lines = [head.join(',')]
  for (const w of rows) {
    if (w.deleted) continue
    const common = [
      w.day,
      w.startedAt,
      w.kind,
      (w.title ?? '').replace(/[\n\r,";]/g, ' '),
      w.durationMin,
      w.rpe ?? '',
    ]
    const tail = [
      w.run?.distanceM ?? w.cardio?.distanceM ?? '',
      w.run?.elevationGainM ?? '',
      w.avgHr ?? w.run?.avgHr ?? '',
      w.maxHr ?? w.run?.maxHr ?? '',
      w.whoopStrain ?? '',
      w.source,
      (w.notes ?? '').replace(/[\n\r,";]/g, ' '),
    ]
    if (w.sets?.length) {
      for (const s of w.sets) {
        const ex = exercises.find((e) => e.id === s.exerciseId)
        lines.push(
          [
            ...common,
            ex?.name ?? s.exerciseId,
            s.reps ?? '',
            s.loadKg ?? '',
            s.holdSec ?? '',
            s.restSec ?? '',
            s.failure ? 'oui' : '',
            ...tail,
          ].join(','),
        )
      }
    } else {
      lines.push([...common, '', '', '', '', '', '', ...tail].join(','))
    }
  }
  return lines.join('\n')
}

export async function wipeData() {
  await db.transaction(
    'rw',
    [db.checkins, db.workouts, db.goals, db.metrics, db.imports, db.syncQueue, db.tasks, db.deadlines, db.notes],
    async () => {
      await db.notes.clear()
      await db.tasks.clear()
      await db.deadlines.clear()
      await db.checkins.clear()
      await db.workouts.clear()
      await db.goals.clear()
      await db.metrics.clear()
      await db.imports.clear()
      await db.syncQueue.clear()
    },
  )
}

export async function wipeEverything() {
  await db.delete()
  location.reload()
}
