import type { CustomMetric, Settings, WeekdayPlan, WorkoutTypeDef } from '../types'
import { EXERCISE_LIBRARY, TEMPLATE_SEEDS } from '../engine/muscleMap'
import { db, nowIso } from './db'
import { backfillTemplates, deleteGoal, deleteWorkout, getSettings, saveWorkout, saveWorkouts } from './repo'
import { planFragments, planMerges } from '../engine/merge'

/* ──────────────────────────────────────────────────────────────────────────
   Amorçage du premier lancement : bibliothèque d'exercices, modèles,
   types de séance, plan hebdo et objectifs d'exemple.
   Tout est modifiable ensuite, rien n'est figé dans le code.
   ────────────────────────────────────────────────────────────────────────── */

export const RUN_5K_REFERENCE_ID = 'run_5k'

/** Plan hebdomadaire proposé par défaut (0 = dimanche). */
export const DEFAULT_WEEKLY_PLAN: WeekdayPlan = [
  { weekday: 1, kind: 'street', label: 'Pull' },
  { weekday: 2, kind: 'course', label: 'Footing' },
  { weekday: 3, kind: 'street', label: 'Push' },
  { weekday: 4, kind: 'abdos', label: 'Core' },
  { weekday: 5, kind: 'street', label: 'Legs / Skills' },
  { weekday: 6, kind: 'course', label: 'Sortie longue' },
  { weekday: 0, kind: 'repos' },
]

const WORKOUT_TYPE_SEEDS: Omit<WorkoutTypeDef, 'updatedAt'>[] = [
  {
    id: 'wt_hyrox',
    name: 'Circuit (EMOM / AMRAP)',
    color: '#9b7bff',
    loadFactor: 2.4,
    mix: { quadriceps: 0.7, abdos: 0.7, deltoides_ant: 0.5, pectoraux: 0.5, dorsaux: 0.5, mollets: 0.5 },
    fields: [
      { id: 'f_format', label: 'Format', type: 'choice', choices: ['EMOM', 'AMRAP', 'For time', 'Tabata'] },
      { id: 'f_tours', label: 'Tours réalisés', type: 'number', min: 0, max: 100 },
      { id: 'f_fini', label: 'Terminé', type: 'boolean' },
    ],
  },
  {
    id: 'wt_etirements',
    name: 'Étirements / mobilité',
    color: '#27e0c0',
    loadFactor: 0.6,
    mix: { ischios: 0.3, lombaires: 0.3, adducteurs: 0.3, trapezes: 0.2 },
    fields: [{ id: 'f_zone', label: 'Zone travaillée', type: 'text' }],
  },
]

const METRIC_SEEDS: Omit<CustomMetric, 'updatedAt'>[] = [
  { id: 'cm_motivation', name: 'Motivation', unit: '/10', min: 0, max: 10, color: '#9b7bff', higherIsBetter: true },
  { id: 'cm_cafeine', name: 'Caféine', unit: 'tasses', min: 0, max: 8, color: '#ffc24b', higherIsBetter: false },
]

/** Références de départ, modifiables dans Réglages → Profil. */
export const STARTING_REFERENCES: Settings['references'] = [
  { exerciseId: 'ex_tractions_pronation', reps: 31 },
  { exerciseId: 'ex_tractions_lestees', reps: 20, loadKg: 10 },
  { exerciseId: 'ex_pompes', reps: 100 },
  { exerciseId: 'ex_dips', reps: 80 },
  { exerciseId: 'ex_dips_lestes', reps: 30, loadKg: 10 },
  { exerciseId: 'ex_muscle_up', reps: 10 },
  { exerciseId: 'ex_lsit', holdSec: 30 },
  { exerciseId: 'ex_front_lever', holdSec: 3 },
  { exerciseId: RUN_5K_REFERENCE_ID, holdSec: 20 * 60 },
]

export async function ensureSeeded(): Promise<void> {
  await seedFirstRun()
  await backfillTemplates()
  await migrations()
}

/** Anciens exemples d'objectifs préremplis (jamais choisis par l'utilisateur) : retirés une fois. */
const SEEDED_GOAL_NAMES = [
  /^\d+ séances par semaine$/,
  /^Plan hebdomadaire$/,
  /^\d+ km par semaine$/,
  /^Sommeil moyen 7 h 30$/,
  /^5 nuits au-dessus de 7 h$/,
  /^Récupération moyenne ≥ 65 %$/,
  /^\d+ tractions strictes$/,
  /^5 km sous 20 min$/,
]

async function migrations(): Promise<void> {
  if (!(await db.meta.get('goals_cleanup_v2'))) {
    const goals = await db.goals.toArray()
    const seen = new Set<string>()
    for (const g of goals) {
      if (g.deleted) continue
      const key = `${g.name}|${g.kind}|${g.period}`
      if (SEEDED_GOAL_NAMES.some((re) => re.test(g.name)) || seen.has(key)) await deleteGoal(g.id)
      else seen.add(key)
    }
    await db.meta.put({ key: 'goals_cleanup_v2', value: nowIso() })
  }
  if (!(await db.meta.get('gymnastics_title_v2'))) {
    const rows = (await db.workouts.toArray()).filter((w) => !w.deleted && w.source === 'whoop' && /gymnas/i.test(w.title ?? ''))
    if (rows.length) await saveWorkouts(rows.map((w) => ({ ...w, kind: 'street' as const, cardio: undefined, title: 'Street workout' })))
    await db.meta.put({ key: 'gymnastics_title_v2', value: nowIso() })
  }
  if (!(await db.meta.get('whoop_walks_removed_v1'))) {
    /* La montre classe chaque marche en « activité » : ce ne sont pas des séances. */
    const walks = (await db.workouts.toArray()).filter((w) => !w.deleted && w.source === 'whoop' && (w.cardio?.modality === 'marche' || /walk|march/i.test(w.title ?? '')))
    for (const w of walks) await deleteWorkout(w.id)
    await db.meta.put({ key: 'whoop_walks_removed_v1', value: nowIso() })
  }
  if (!(await db.meta.get('whoop_other_removed_v1'))) {
    const others = (await db.workouts.toArray()).filter((w) => !w.deleted && w.source === 'whoop' && w.cardio?.modality === 'autre')
    for (const w of others) await deleteWorkout(w.id)
    await db.meta.put({ key: 'whoop_other_removed_v1', value: nowIso() })
  }
  await mergeProgramWithWhoop()
  if (!(await db.meta.get('whoop_removed_v2'))) {
    /* WHOOP n'est plus utilisé : ses séances disparaissent du calendrier, sauf celles qui portent une case du programme (on les garde, devenues manuelles). */
    for (const w of (await db.workouts.toArray()).filter((x) => !x.deleted && x.source === 'whoop')) {
      if (w.program?.length) await saveWorkout({ ...w, source: 'manual' })
      else await deleteWorkout(w.id)
    }
    await db.meta.put({ key: 'whoop_removed_v2', value: nowIso() })
  }
  if (!(await db.meta.get('gymnastics_street_v1'))) {
    const rows = (await db.workouts.toArray()).filter(
      (w) => !w.deleted && w.source === 'whoop' && /gymnas/i.test(w.title ?? '') && w.kind !== 'street',
    )
    if (rows.length) await saveWorkouts(rows.map((w) => ({ ...w, kind: 'street' as const, cardio: undefined })))
    await db.meta.put({ key: 'gymnastics_street_v1', value: nowIso() })
  }
}

async function seedFirstRun(): Promise<void> {
  const flag = await db.meta.get('seeded_v1')
  const existing = await db.exercises.count()
  if (flag && existing > 0) return

  const now = nowIso()
  await db.transaction(
    'rw',
    [db.exercises, db.templates, db.workoutTypes, db.goals, db.metrics, db.settings, db.meta],
    async () => {
      if (existing === 0) {
        await db.exercises.bulkPut(EXERCISE_LIBRARY.map((e) => ({ ...e, updatedAt: now })))
      }
      if ((await db.templates.count()) === 0) {
        await db.templates.bulkPut(TEMPLATE_SEEDS.map((t) => ({ ...t, updatedAt: now })))
      }
      if ((await db.workoutTypes.count()) === 0) {
        await db.workoutTypes.bulkPut(WORKOUT_TYPE_SEEDS.map((t) => ({ ...t, updatedAt: now })))
      }
      if ((await db.metrics.count()) === 0) {
        await db.metrics.bulkPut(METRIC_SEEDS.map((m) => ({ ...m, updatedAt: now })))
      }
      await db.meta.put({ key: 'seeded_v1', value: now })
    },
  )

  const settings = await getSettings()
  if (!settings.references.length) {
    await db.settings.put({
      ...settings,
      references: STARTING_REFERENCES,
      updatedAt: nowIso(),
    })
  }
}

/** Allure de référence sur 5 km, en secondes par km. */
export function referencePaceSecPerKm(settings: Settings): number | undefined {
  const ref = settings.references.find((r) => r.exerciseId === RUN_5K_REFERENCE_ID)
  if (!ref?.holdSec) return undefined
  return ref.holdSec / 5
}

/** Fusionne en base les activités découpées de la montre, puis les doublons « séance du programme + séance de la montre ». */
export async function mergeProgramWithWhoop(): Promise<number> {
  let n = 0
  for (const f of planFragments(await db.workouts.toArray())) {
    await saveWorkout(f.keep)
    for (const d of f.drop) await deleteWorkout(d.id)
    n++
  }
  const plans = planMerges(await db.workouts.toArray())
  for (const p of plans) {
    await saveWorkout(p.keep)
    await deleteWorkout(p.drop.id)
  }
  return n + plans.length
}
