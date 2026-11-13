/* ──────────────────────────────────────────────────────────────────────────
   Soma — types stricts partagés entre le moteur (engine/) et l'UI.
   Aucune dépendance React ici.
   ────────────────────────────────────────────────────────────────────────── */

/** Identifiant stable (uuid v4 ou dérivé d'un import). */
export type Id = string

/** Date civile locale au format `yyyy-MM-dd`. */
export type DayKey = string

/** Horodatage ISO 8601 avec fuseau. */
export type Iso = string

export type DataSource = 'manual' | 'whoop' | 'demo' | 'import'

/* ── Zones musculaires ─────────────────────────────────────────────────── */

export const MUSCLE_ZONES = [
  'trapezes',
  'deltoides_ant',
  'deltoides_post',
  'pectoraux',
  'biceps',
  'triceps',
  'avantbras',
  'haut_dos',
  'dorsaux',
  'abdos',
  'obliques',
  'lombaires',
  'fessiers',
  'quadriceps',
  'ischios',
  'adducteurs',
  'mollets',
  'tibias',
] as const

export type MuscleZone = (typeof MUSCLE_ZONES)[number]

export const JOINTS = ['epaules', 'coudes', 'poignets', 'genoux', 'chevilles'] as const
export type Joint = (typeof JOINTS)[number]

/** Répartition d'un exercice sur les zones (coefficient 0 → 1). */
export type MuscleMix = Partial<Record<MuscleZone, number>>

export type ZoneSize = 'small' | 'medium' | 'large'

/* ── Exercices ─────────────────────────────────────────────────────────── */

export type ExerciseKind =
  | 'bodyweight' /* reps, lest possible */
  | 'weighted' /* charge externe */
  | 'static' /* tenue en secondes */
  | 'cardio' /* durée / distance */
  | 'core'

export type ExerciseUnit = 'reps' | 'seconds' | 'meters' | 'minutes'

export interface ExerciseDef {
  id: Id
  name: string
  kind: ExerciseKind
  unit: ExerciseUnit
  group: string /* ex. « Tirage », « Poussée », « Jambes », « Skills », « Gainage » */
  equipment?: string
  /** Répartition musculaire, réglable par curseur dans Réglages. */
  mix: MuscleMix
  /** Référence personnelle : reps max propres au poids du corps, ou tenue max en s. */
  referenceReps?: number
  referenceLoadKg?: number
  referenceHoldSec?: number
  /** Part du poids du corps mobilisée (tractions ≈ 1, pompes ≈ 0.65, dips ≈ 0.95). */
  bodyweightFactor?: number
  archived?: boolean
  builtin?: boolean
  updatedAt: Iso
}

/* ── Séances ───────────────────────────────────────────────────────────── */

export type WorkoutKind =
  | 'street'
  | 'muscu'
  | 'course'
  | 'cardio'
  | 'abdos'
  | 'mobilite'
  | 'custom'

export type RunType =
  | 'footing'
  | 'tempo'
  | 'fractionne'
  | 'cotes'
  | 'sortie_longue'
  | 'course'
  | 'test'

export interface SetEntry {
  id: Id
  exerciseId: Id
  /** Bloc d'exercice dans la séance : permet de refaire le même exercice plus tard avec d'autres valeurs. */
  block?: string
  reps?: number
  loadKg?: number /* lest (peut être négatif : élastique d'assistance) */
  holdSec?: number
  tempo?: string
  restSec?: number
  rpe?: number
  failure?: boolean
  distanceM?: number
  note?: string
}

export interface IntervalEntry {
  id: Id
  repetitions: number
  distanceM?: number
  durationSec?: number
  recoverySec?: number
  note?: string
}

export interface SplitEntry {
  km: number
  durationSec: number
  avgHr?: number
}

export interface RunDetail {
  runType: RunType
  distanceM?: number
  durationSec?: number
  elevationGainM?: number
  elevationLossM?: number
  avgHr?: number
  maxHr?: number
  shoes?: string
  weather?: string
  intervals?: IntervalEntry[]
  splits?: SplitEntry[]
}

export interface CardioDetail {
  modality: string /* vélo, elliptique, rameur, natation, corde à sauter… */
  distanceM?: number
  avgHr?: number
  maxHr?: number
  intensity?: number /* 1 → 10 */
}

/** Minutes passées dans chaque zone de FC (index 0 = zone 1). */
export type HrZoneMinutes = [number, number, number, number, number]

/** Séance du programme réalisée : quelle séance (T1, A2…) et quelle semaine (1 → 12). */
export interface ProgramRef {
  code: string
  week: number
}

export interface Workout {
  id: Id
  day: DayKey
  /** Heure de début réelle : décisive pour le moteur de fatigue. */
  startedAt: Iso
  durationMin: number
  kind: WorkoutKind
  /** Type personnalisé (id d'un WorkoutTypeDef) si kind === 'custom'. */
  customTypeId?: Id
  title?: string
  rpe?: number /* 1 → 10 */
  feeling?: 1 | 2 | 3 | 4 | 5
  notes?: string
  sets?: SetEntry[]
  run?: RunDetail
  cardio?: CardioDetail
  /** Strain WHOOP 0 → 21 si importé. */
  whoopStrain?: number
  avgHr?: number
  maxHr?: number
  hrZoneMinutes?: HrZoneMinutes
  /** Valeurs des champs personnalisés du type de séance. */
  customValues?: Record<string, string | number | boolean>
  /** Répartition musculaire forcée (séance WHOOP sans détail). */
  fallbackMix?: MuscleMix
  /** Séances du programme couvertes par cette séance (plusieurs possibles le même jour). */
  program?: ProgramRef[]
  /** Simple coche de rattrapage (« déjà faite ») : jamais comptée dans les séances, la charge ni la fatigue. */
  backfill?: boolean
  planned?: boolean
  source: DataSource
  /** Clé de dédoublonnage d'import (ex. `whoop:2025-04-02T06:12:00Z`). */
  externalKey?: string
  updatedAt: Iso
  deleted?: boolean
}

export interface TemplateSet {
  reps?: number
  loadKg?: number
  holdSec?: number
  restSec?: number
  failure?: boolean
}

export interface TemplateItem {
  exerciseId: Id
  sets: number
  reps?: number
  loadKg?: number
  holdSec?: number
  restSec?: number
  /** Détail exact série par série, si elles diffèrent (ex. 10 + 8 + 6). */
  setList?: TemplateSet[]
}

/** Une « séance mémorisée » : ce que tu as déjà fait, prêt à être refait. */
export interface WorkoutTemplate {
  id: Id
  name: string
  kind: WorkoutKind
  items: TemplateItem[]
  customTypeId?: Id
  durationMin?: number
  rpe?: number
  run?: RunDetail
  cardio?: CardioDetail
  /** Dernière fois que la séance a été faite. */
  lastDoneAt?: Iso
  /** Créée automatiquement à l'enregistrement d'une séance. */
  auto?: boolean
  updatedAt: Iso
}

export type CustomFieldType = 'text' | 'number' | 'duration' | 'choice' | 'boolean'

export interface CustomField {
  id: Id
  label: string
  type: CustomFieldType
  unit?: string
  choices?: string[]
  min?: number
  max?: number
}

export interface WorkoutTypeDef {
  id: Id
  name: string
  color: string
  /** Contribution à la charge : multiplicateur appliqué à durée × RPE. */
  loadFactor: number
  mix: MuscleMix
  fields: CustomField[]
  updatedAt: Iso
}

/* ── Check-in du matin ─────────────────────────────────────────────────── */

export interface SleepEntry {
  /** Heures de sommeil effectif. */
  hours?: number
  /** Qualité ressentie 0 → 100 (ou Sleep performance WHOOP). */
  quality?: number
  bedtime?: Iso
  wakeTime?: Iso
  awakenings?: number
  /** Minutes par phase, si connues (WHOOP). */
  lightMin?: number
  deepMin?: number
  remMin?: number
  awakeMin?: number
  efficiency?: number /* % */
  consistency?: number /* % */
  /** Dette de sommeil déclarée par WHOOP, en minutes. */
  debtMin?: number
  /** Temps au lit, en heures. */
  inBedHours?: number
}

export interface Soreness {
  zone: MuscleZone
  level: number /* 0 → 10 */
}

export interface CheckIn {
  id: Id /* = day */
  day: DayKey
  recovery?: number /* 0 → 100 */
  sleep?: SleepEntry
  restingHr?: number
  hrv?: number
  weightKg?: number
  mood?: number /* 1 → 5 */
  energy?: number /* 1 → 5 */
  stress?: number /* 1 → 5 */
  hydrationL?: number
  soreness?: Soreness[]
  notes?: string
  /** Métriques personnalisées : clé = CustomMetric.id. */
  custom?: Record<string, number>
  respiratoryRate?: number
  spo2?: number
  skinTempC?: number
  /** Strain WHOOP du jour (0 → 21). */
  whoopDayStrain?: number
  source: DataSource
  updatedAt: Iso
  deleted?: boolean
}

export interface CustomMetric {
  id: Id
  name: string
  unit?: string
  min: number
  max: number
  color: string
  higherIsBetter?: boolean
  updatedAt: Iso
}

/* ── Objectifs ─────────────────────────────────────────────────────────── */

export type GoalPeriod = 'week' | 'month'

export type GoalKind =
  | 'sessions_count'
  | 'sessions_by_kind'
  | 'weekly_plan'
  | 'volume_km'
  | 'volume_reps'
  | 'volume_tonnage'
  | 'cardio_minutes'
  | 'performance'
  | 'sleep_hours'
  | 'sleep_regularity'
  | 'sleep_nights_above'
  | 'weight'
  | 'resting_hr'
  | 'hrv'
  | 'recovery_avg'
  | 'custom_metric'

/** 0 = lundi … 6 = dimanche. */
export type WeekdayPlan = { weekday: number; kind: WorkoutKind | 'repos'; label?: string }[]

export interface Goal {
  id: Id
  name: string
  kind: GoalKind
  period: GoalPeriod
  target: number
  /** Direction : atteindre au moins (`min`) ou rester sous (`max`). */
  direction: 'min' | 'max'
  unit?: string
  weight: number /* pondération dans le score Alignement */
  active: boolean
  /* champs contextuels selon kind */
  workoutKind?: WorkoutKind
  exerciseId?: Id
  customMetricId?: Id
  plan?: WeekdayPlan
  deadline?: DayKey
  /** Seuil secondaire : ex. nombre d'heures qu'une nuit doit dépasser. */
  threshold?: number
  thresholdOk?: number /* défaut 0.8 */
  thresholdMid?: number /* défaut 0.6 */
  updatedAt: Iso
  deleted?: boolean
}

export type GoalStatus = 'ok' | 'mid' | 'late' | 'empty'

export interface GoalProgress {
  goal: Goal
  actual: number
  target: number
  ratio: number /* 0 → 1+ */
  status: GoalStatus
  label: string
  detail?: string
  series?: { label: string; planned: number; actual: number }[]
}

/* ── Objectif à date (compte à rebours) ────────────────────────────────── */

export interface Countdown {
  name: string
  date: DayKey
  discipline?: string
}

/* ── Observations (suivi de fond) ──────────────────────────────────────── */

export type ObservationLevel = 'info' | 'note' | 'watch'

export interface Observation {
  id: string
  level: ObservationLevel
  title: string
  sentence: string
  /** Série à afficher en mini graphique. */
  series?: { day: DayKey; value: number }[]
  baseline?: number
  metricLabel?: string
  score: number /* priorité de tri */
}

/* ── Moteur de fatigue ─────────────────────────────────────────────────── */

export interface FatigueConfig {
  /** Numéro de version des valeurs par défaut : un changement remplace les anciens réglages. */
  configVersion: number
  /** Repos de référence entre deux séries (s) : en dessous, l'effort monte ; au-dessus, il baisse. */
  restRefSec: number
  /** Variation d'effort par seconde d'écart au repos de référence. */
  restSensitivity: number
  restFactorMin: number
  restFactorMax: number
  /** Constante de saturation du volume : F0 = 100 × (1 − exp(−(V/k + w·P²))). */
  k: Record<ZoneSize, number>
  /** Poids du pic d'intensité P (proximité de l'échec) dans l'exposant. */
  peakWeight: number
  /** Demi-vie exponentielle, en heures, par taille de zone. */
  tau: Record<ZoneSize, number>
  /** Plafond d'effort relatif par série. */
  effortCap: number
  /** Multiplicateur si série menée à l'échec. */
  failureBonus: number
  /** Majoration si la charge de zone dépasse `overreachRatio` × moyenne 4 semaines. */
  overreachRatio: number
  overreachBonus: number
  /** Multiplicateur de récupération pendant le sommeil (min → max selon qualité). */
  sleepMultiplier: { min: number; max: number }
  /** Multiplicateur de récupération éveillé (récup 0 % → 100 %). */
  awakeMultiplier: { min: number; max: number }
  /** Seuils de couleur. */
  colorStops: number[]
  /** Fatigue au-delà de laquelle la zone pulse. */
  pulseThreshold: number
  /** Charge cardio : contribution de la course par minute à intensité 1. */
  runLoadPerMin: number
  cardioLoadPerMin: number
  /** Bonus excentrique par 100 m de D−. */
  downhillBonus: number
  /** Poids du strain WHOOP dans la pondération globale (0 = ignoré). */
  whoopStrainWeight: number
  /** Seuil « prêt » pour l'estimation « prêt dans X h ». */
  readyThreshold: number
}

export interface ZoneFatigue {
  zone: MuscleZone
  value: number /* 0 → 100 */
  hasHistory: boolean
  readyInHours: number | null
  contributors: {
    workoutId: Id
    startedAt: Iso
    label: string
    load: number
    hoursAgo: number
    overreach: boolean
  }[]
  load7d: number
  load28dAvg7d: number
}

export type BodyFatigue = Record<MuscleZone, ZoneFatigue>

/* ── Scores dérivés ───────────────────────────────────────────────────── */

export interface SleepScore {
  score: number /* 0 → 100 */
  durationPart: number
  stagesPart: number
  efficiencyPart: number
  consistencyPart: number
  debtPart: number
  debtHours7d: number
  hours: number | null
}

export interface CardioScore {
  score: number
  hrvDeltaPct: number | null
  rhrDelta: number | null
  hrvBaseline: number | null
  rhrBaseline: number | null
  highZoneMinutes7d: number
}

export interface DayLoad {
  day: DayKey
  load: number /* 0 → 21 */
  sources: { workoutId: Id; load: number }[]
}

export interface LoadBalance {
  acute7: number
  chronic28: number
  ratio: number
}

/* ── Profil & réglages ────────────────────────────────────────────────── */

export interface ExerciseReference {
  exerciseId: Id
  reps?: number
  loadKg?: number
  holdSec?: number
}

export interface HrZones {
  /** Bornes basses des zones 1 → 5, en bpm. */
  bounds: [number, number, number, number, number]
  maxHr: number
}

export interface Settings {
  id: 'settings'
  heightCm?: number
  weightKg?: number
  birthYear?: number
  level: 'debutant' | 'intermediaire' | 'avance'
  references: ExerciseReference[]
  hrZones: HrZones
  sleepGoalHours: number
  weekStartsOn: 0 | 1
  units: 'metric' | 'imperial'
  accent: string
  bodyRender: '3d' | '2d'
  countdown?: Countdown
  fatigue: FatigueConfig
  reduceMotion?: boolean
  lastWeeklyDigest?: DayKey
  updatedAt: Iso
}

/* ── Sync ─────────────────────────────────────────────────────────────── */

export type SyncTable =
  | 'checkins'
  | 'workouts'
  | 'exercises'
  | 'goals'
  | 'metrics'
  | 'templates'
  | 'workoutTypes'
  | 'settings'
  | 'tasks'
  | 'deadlines'
  | 'notes'
  | 'programs'
  | 'reviews'
  | 'injuries'

export interface SyncOp {
  id?: number
  table: SyncTable
  rowId: string
  payload: unknown
  updatedAt: Iso
  op: 'upsert' | 'delete'
}

export type SyncState =
  | { kind: 'disabled' }
  | { kind: 'signed-out' }
  | { kind: 'idle'; email: string; lastSync?: Iso; pending: number }
  | { kind: 'syncing'; email: string; pending: number }
  | { kind: 'error'; email?: string; message: string }

/* ── Import WHOOP ─────────────────────────────────────────────────────── */

export interface WhoopImportPreview {
  days: CheckIn[]
  workouts: Workout[]
  nights: number
  filesRead: { name: string; rows: number; kind: WhoopFileKind }[]
  skippedDuplicates: number
  warnings: string[]
}

export type WhoopFileKind = 'cycles' | 'sleeps' | 'workouts' | 'journal' | 'unknown'

export interface WhoopImport {
  id: Id
  importedAt: Iso
  files: string[]
  dayCount: number
  workoutCount: number
  nightCount: number
}


/* ── Vie : tâches & échéances ─────────────────────────────────────────── */

export type TaskPriority = 'haute' | 'normale' | 'basse'
export type TaskCategory = 'ecole' | 'business' | 'sport' | 'perso'
export type TaskStatus = 'a_faire' | 'en_cours' | 'fait'

export interface TaskSource {
  kind: 'mail' | 'event'
  ref: string
  url?: string
  label?: string
}

/** Nature d'une tâche : une tâche simple, ou un rendez-vous, un concours, un appel… */
export type TaskKind = 'tache' | 'rdv' | 'concours' | 'appel' | 'rendu' | 'penser' | 'achat'

export interface Task {
  id: Id
  title: string
  kind?: TaskKind
  due?: DayKey
  /** Heure facultative `HH:MM`. */
  dueTime?: string
  priority: TaskPriority
  category: TaskCategory
  status: TaskStatus
  notes?: string
  source?: TaskSource
  createdAt: Iso
  completedAt?: Iso
  updatedAt: Iso
  deleted?: boolean
}

export type DeadlineKind =
  | 'rendu'
  | 'oral'
  | 'concours'
  | 'business'
  | 'autre'
  | 'rdv'
  | 'appel'
  | 'penser'
  | 'achat'

export interface Deadline {
  id: Id
  title: string
  date: DayKey
  kind: DeadlineKind
  category?: TaskCategory
  notes?: string
  done?: boolean
  updatedAt: Iso
  deleted?: boolean
}


/* ── Base de connaissances ───────────────────────────────────────────── */

export type KnowledgeKind = 'profile' | 'hub' | 'area' | 'project' | 'topic' | 'person' | 'note' | 'doc'

export interface KnowledgeFact {
  text: string
  /** `verify` : incohérence ou doute, à trancher. */
  status: 'stated' | 'verify'
}

export interface KnowledgeNote {
  id: Id
  title: string
  kind: KnowledgeKind
  /** Axe de vie (identifiant court en minuscules, ex. `sport`). */
  axe?: string
  summary?: string
  facts: KnowledgeFact[]
  /** Texte libre (Markdown léger) avec [[liens]] et #tags. */
  body?: string
  /** Titres des fiches citées. */
  links: string[]
  tags: string[]
  source: 'claude' | 'manual'
  /** Modifiée à la main : un ré-import ne l'écrase plus. */
  edited?: boolean
  createdAt: Iso
  updatedAt: Iso
  deleted?: boolean
}


/* ── Programme d'entraînement (importé) ────────────────────────────────── */

export interface ProgramWeek {
  n: number
  /** Libellé des dates, tel qu'écrit dans le programme (« 12-18 oct »). */
  label: string
  startDay?: DayKey
  endDay?: DayKey
  light?: boolean
  test?: boolean
}

export interface ProgramBlock {
  /** « A. Lestées +25 kg », « Rameur »… */
  name: string
  /** Consigne du bloc (repos, tempo, rappel). */
  note?: string
  restSec?: number
  /** Une cellule par semaine, dans l'ordre de `weeks`. */
  cells: string[]
}

export interface ProgramSession {
  code: string
  title: string
  meta?: string
  durationMin?: number
  weeks: ProgramWeek[]
  blocks: ProgramBlock[]
}

/** Le programme complet : chaque séance et chaque semaine sont indépendantes. */
export interface Program {
  id: 'program'
  name: string
  sessions: ProgramSession[]
  /** Exercices créés à l'import pour ce programme (id → nom), pour information. */
  importedAt: Iso
  updatedAt: Iso
  deleted?: boolean
}

/* ── Boucle de revue hebdomadaire ───────────────────────────────────────── */

export interface WeeklyReview {
  /** Lundi de la semaine revue, `yyyy-MM-dd`. */
  id: DayKey
  weekStart: DayKey
  wentWell?: string
  heavy?: string
  nextFocus?: string
  /** Réponse à la question de la semaine. */
  answer?: string
  question?: string
  rating?: 1 | 2 | 3 | 4 | 5
  createdAt: Iso
  updatedAt: Iso
  deleted?: boolean
}


/* ── Douleurs et blessures ─────────────────────────────────────────────── */

export interface Injury {
  id: Id
  /** Articulation ou zone musculaire concernée. */
  area: Joint | MuscleZone
  /** 1 = gêne légère, 2 = douleur modérée, 3 = forte douleur. */
  severity: 1 | 2 | 3
  note?: string
  since: DayKey
  /** Faux une fois guérie : on garde l'historique. */
  active: boolean
  updatedAt: Iso
  deleted?: boolean
}
