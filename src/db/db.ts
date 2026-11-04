import Dexie, { type EntityTable } from 'dexie'
import type {
  CheckIn,
  CustomMetric,
  ExerciseDef,
  Goal,
  Settings,
  SyncOp,
  WhoopImport,
  Workout,
  WorkoutTemplate,
  WorkoutTypeDef,
} from '../types'
import { DEFAULT_FATIGUE_CONFIG } from '../engine/fatigueConfig'
import { defaultHrZones } from '../engine/cardio'

/* ──────────────────────────────────────────────────────────────────────────
   Dexie / IndexedDB — stockage local principal. L'app fonctionne hors ligne.
   Les migrations sont versionnées : ajouter un champ ne perd aucune donnée.
   ────────────────────────────────────────────────────────────────────────── */

export interface MetaRow {
  key: string
  value: unknown
}

export class SomaDb extends Dexie {
  checkins!: EntityTable<CheckIn, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  exercises!: EntityTable<ExerciseDef, 'id'>
  templates!: EntityTable<WorkoutTemplate, 'id'>
  workoutTypes!: EntityTable<WorkoutTypeDef, 'id'>
  goals!: EntityTable<Goal, 'id'>
  metrics!: EntityTable<CustomMetric, 'id'>
  settings!: EntityTable<Settings, 'id'>
  syncQueue!: EntityTable<SyncOp, 'id'>
  imports!: EntityTable<WhoopImport, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'soma') {
    super(name)

    /* v1 — schéma initial. */
    this.version(1).stores({
      checkins: 'id, day, updatedAt, source',
      workouts: 'id, day, startedAt, kind, updatedAt, source, externalKey',
      exercises: 'id, name, group, archived, updatedAt',
      templates: 'id, name, kind, updatedAt',
      workoutTypes: 'id, name, updatedAt',
      goals: 'id, kind, period, active, updatedAt',
      metrics: 'id, name, updatedAt',
      settings: 'id, updatedAt',
      syncQueue: '++id, table, rowId, updatedAt',
      imports: 'id, importedAt',
      meta: 'key',
    })

    /* v2 — index supplémentaires pour les analyses (aucune perte de données). */
    this.version(2)
      .stores({
        workouts: 'id, day, startedAt, kind, updatedAt, source, externalKey, planned',
        checkins: 'id, day, updatedAt, source, recovery',
      })
      .upgrade(async (tx) => {
        await tx
          .table<Workout>('workouts')
          .toCollection()
          .modify((w) => {
            if (w.planned === undefined) w.planned = false
          })
      })
  }
}

export const db = new SomaDb()

/* ── Réglages par défaut ─────────────────────────────────────────────── */

/** Poids de secours tant que le profil n'est pas rempli (jamais codé en dur ailleurs). */
export const FALLBACK_BODY_WEIGHT_KG = 70

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    level: 'avance',
    references: [],
    hrZones: defaultHrZones(30),
    sleepGoalHours: 8,
    weekStartsOn: 1,
    units: 'metric',
    accent: '#35e3ff',
    bodyRender: '3d',
    fatigue: structuredClone(DEFAULT_FATIGUE_CONFIG),
    updatedAt: new Date().toISOString(),
  }
}

/** Fusionne une ligne stockée avec les valeurs par défaut (lecture seule). */
export function withSettingsDefaults(row?: Settings): Settings {
  const base = defaultSettings()
  if (!row) return base
  return { ...base, ...row, fatigue: { ...base.fatigue, ...row.fatigue } }
}

export const uid = (prefix = 'id'): string => {
  const g = globalThis.crypto
  const raw = g?.randomUUID
    ? g.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${raw.replace(/-/g, '').slice(0, 20)}`
}

export const nowIso = () => new Date().toISOString()
