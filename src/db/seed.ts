import type { CustomMetric, Goal, Settings, WeekdayPlan, WorkoutTypeDef } from '../types'
import { EXERCISE_LIBRARY, TEMPLATE_SEEDS } from '../engine/muscleMap'
import { addDayKey, todayKey } from '../engine/time'
import { db, nowIso, uid } from './db'
import { backfillTemplates, getSettings } from './repo'

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

function exampleGoals(level: Settings['level']): Goal[] {
  const sessionsPerWeek = level === 'debutant' ? 3 : level === 'intermediaire' ? 4 : 5
  const kmPerWeek = level === 'debutant' ? 12 : level === 'intermediaire' ? 22 : 32
  const pullTarget = level === 'debutant' ? 15 : level === 'intermediaire' ? 25 : 40
  const g = (over: Omit<Goal, 'id' | 'updatedAt' | 'weight' | 'active'> & Partial<Goal>): Goal => ({
    id: uid('goal'),
    weight: 1,
    active: true,
    updatedAt: nowIso(),
    ...over,
  })
  return [
    g({
      name: `${sessionsPerWeek} séances par semaine`,
      kind: 'sessions_count',
      period: 'week',
      target: sessionsPerWeek,
      direction: 'min',
      unit: 'séances',
      weight: 2,
    }),
    g({
      name: 'Plan hebdomadaire',
      kind: 'weekly_plan',
      period: 'week',
      target: 6,
      direction: 'min',
      plan: DEFAULT_WEEKLY_PLAN,
      weight: 1.5,
    }),
    g({
      name: `${kmPerWeek} km par semaine`,
      kind: 'volume_km',
      period: 'week',
      target: kmPerWeek,
      direction: 'min',
      unit: 'km',
    }),
    g({
      name: 'Sommeil moyen 7 h 30',
      kind: 'sleep_hours',
      period: 'week',
      target: 7.5,
      direction: 'min',
      unit: 'h',
      weight: 1.5,
    }),
    g({
      name: '5 nuits au-dessus de 7 h',
      kind: 'sleep_nights_above',
      period: 'week',
      target: 5,
      direction: 'min',
      threshold: 7,
      unit: 'nuits',
    }),
    g({
      name: 'Récupération moyenne ≥ 65 %',
      kind: 'recovery_avg',
      period: 'week',
      target: 65,
      direction: 'min',
      unit: '%',
    }),
    g({
      name: `${pullTarget} tractions strictes`,
      kind: 'performance',
      period: 'month',
      target: pullTarget,
      direction: 'min',
      exerciseId: 'ex_tractions_pronation',
      unit: 'reps',
      deadline: addDayKey(todayKey(), 180),
    }),
    g({
      name: '5 km sous 20 min',
      kind: 'performance',
      period: 'month',
      target: 1,
      direction: 'min',
      unit: 'objectif',
      deadline: addDayKey(todayKey(), 180),
      active: false,
    }),
  ]
}

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
      countdown: settings.countdown ?? {
        name: 'Objectif 40 tractions',
        date: addDayKey(todayKey(), 180),
        discipline: 'Street workout',
      },
      updatedAt: nowIso(),
    })
  }
  if ((await db.goals.count()) === 0) {
    await db.goals.bulkPut(exampleGoals(settings.level))
  }
}

/** Allure de référence sur 5 km, en secondes par km. */
export function referencePaceSecPerKm(settings: Settings): number | undefined {
  const ref = settings.references.find((r) => r.exerciseId === RUN_5K_REFERENCE_ID)
  if (!ref?.holdSec) return undefined
  return ref.holdSec / 5
}
