import type {
  CheckIn,
  CustomMetric,
  DayKey,
  ExerciseDef,
  ExerciseReference,
  Goal,
  GoalProgress,
  GoalStatus,
  HrZones,
  Workout,
  WorkoutKind,
} from '../types'
import { clamp, mean } from './stats'
import { exerciseRecords, exerciseVolume, volumeSummary } from './load'
import { sleepHours, sleepRegularity } from './sleep'
import { WORKOUT_KIND_LABEL } from './muscleMap'
import { socleOf } from './rotation'
import { addDayKey, dayRange, parseDay, weekBounds } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Objectifs : prévu contre réel, sur une semaine ou un mois.
   Ton neutre : jamais de « raté », seulement « tenu / en cours / en retard ».
   ────────────────────────────────────────────────────────────────────────── */

export interface GoalContext {
  workouts: Workout[]
  checkins: CheckIn[]
  exercises: ExerciseDef[]
  customMetrics: CustomMetric[]
  bodyWeightKg: number
  sleepGoalHours: number
  weekStartsOn: 0 | 1
  hrZones?: HrZones
  /** Records saisis à la main (onglet Records) : comptent pour les objectifs « record visé ». */
  references?: ExerciseReference[]
}

const RUN_5K_ID = 'run_5k'

const SESSION_GAP_MIN = 60

/** Séances distinctes : deux enregistrements qui se touchent (à moins d'une heure d'écart) ne font qu'une séance. */
export function distinctSessions(ws: Workout[]): Workout[] {
  const sorted = [...ws].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const out: Workout[] = []
  let end = 0
  for (const w of sorted) {
    const start = new Date(w.startedAt).getTime()
    if (out.length && start - end <= SESSION_GAP_MIN * 60_000) {
      end = Math.max(end, start + w.durationMin * 60_000)
      continue
    }
    out.push(w)
    end = start + w.durationMin * 60_000
  }
  return out
}

export const SOCLE_LABEL: Record<NonNullable<Goal['socle']>, string> = {
  street: 'Street workout',
  jambes: 'Jambes',
  abdos: 'Abdos',
  cardio: 'Cardio',
  course: 'Course à pied',
  natation: 'Natation',
}

/** Une séance compte-t-elle pour cette famille ? (programme : séances cochées ; sinon type de séance) */
export function countsForSocle(w: Workout, socle: NonNullable<Goal['socle']>): boolean {
  const fromProgram = (w.program ?? []).some((r) => socleOf(r.code) === socle)
  if (fromProgram) return true
  if (socle === 'street') return w.kind === 'street'
  if (socle === 'abdos') return w.kind === 'abdos'
  if (socle === 'course') return w.kind === 'course'
  if (socle === 'natation') return w.kind === 'cardio' && w.cardio?.modality === 'natation'
  if (socle === 'cardio') return (w.kind === 'cardio' && w.cardio?.modality !== 'natation' && w.cardio?.modality !== 'marche') || w.kind === 'course'
  return false
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  ok: 'Tenu',
  mid: 'En cours',
  late: 'En retard',
  empty: 'Pas de données',
}

export const STATUS_COLOR: Record<GoalStatus, string> = {
  ok: '#41e08a',
  mid: '#ffc24b',
  late: '#ffb02e',
  empty: '#5a6c86',
}

export const GOAL_KIND_LABEL: Record<Goal['kind'], string> = {
  sessions_count: 'Nombre de séances',
  sessions_by_kind: 'Séances par type',
  sessions_socle: 'Séances d’une famille',
  weekly_plan: 'Plan hebdomadaire',
  volume_km: 'Kilomètres',
  volume_reps: 'Répétitions sur un exercice',
  volume_tonnage: 'Tonnage sur un exercice',
  cardio_minutes: 'Minutes de cardio',
  performance: 'Record visé',
  sleep_hours: 'Heures de sommeil',
  sleep_regularity: 'Régularité du sommeil',
  sleep_nights_above: 'Nuits au-dessus d’un seuil',
  weight: 'Poids',
  resting_hr: 'FC de repos',
  hrv: 'HRV',
  recovery_avg: 'Récupération moyenne',
  custom_metric: 'Métrique personnalisée',
}

const WEEKDAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function statusFor(goal: Goal, ratio: number, hasData: boolean): GoalStatus {
  if (!hasData) return 'empty'
  const ok = goal.thresholdOk ?? 0.8
  const mid = goal.thresholdMid ?? 0.6
  if (ratio >= ok) return 'ok'
  if (ratio >= mid) return 'mid'
  return 'late'
}

function inRange(day: DayKey, from: DayKey, to: DayKey) {
  return day >= from && day <= to
}

/** Évalue un objectif sur une période [from, to]. */
export function evaluateGoal(
  goal: Goal,
  from: DayKey,
  to: DayKey,
  ctx: GoalContext,
): GoalProgress {
  const workouts = ctx.workouts.filter(
    (w) => !w.deleted && !w.planned && inRange(w.day, from, to),
  )
  const checkins = ctx.checkins.filter((c) => !c.deleted && inRange(c.day, from, to))
  const byDay = new Map<DayKey, CheckIn>()
  for (const c of ctx.checkins) if (!c.deleted) byDay.set(c.day, c)
  const loadCtx = { exercises: ctx.exercises, bodyWeightKg: ctx.bodyWeightKg, hrZones: ctx.hrZones }

  let actual = 0
  let hasData = true
  let detail: string | undefined
  let series: GoalProgress['series']
  let matched: Workout[] | undefined
  let unit = goal.unit ?? ''

  switch (goal.kind) {
    case 'sessions_count': {
      matched = distinctSessions(workouts.filter((w) => w.cardio?.modality !== 'marche'))
      actual = matched.length
      unit = unit || 'séances'
      break
    }
    case 'sessions_by_kind': {
      matched = distinctSessions(workouts.filter((w) => w.kind === goal.workoutKind))
      actual = matched.length
      unit = unit || 'séances'
      detail = goal.workoutKind ? WORKOUT_KIND_LABEL[goal.workoutKind] : undefined
      break
    }
    case 'sessions_socle': {
      const so = goal.socle ?? 'street'
      matched = distinctSessions(workouts.filter((w) => countsForSocle(w, so)))
      actual = matched.length
      unit = unit || 'séances'
      detail = SOCLE_LABEL[so]
      break
    }
    case 'weekly_plan': {
      const plan = goal.plan ?? []
      const planned = plan.filter((p) => p.kind !== 'repos')
      const days = dayRange(from, to)
      let matched = 0
      series = []
      for (const p of planned) {
        const day = days.find((d) => parseDay(d).getDay() === p.weekday)
        const done = day
          ? workouts.some((w) => w.day === day && w.kind === (p.kind as WorkoutKind))
          : false
        if (done) matched += 1
        series.push({
          label: `${WEEKDAY_SHORT[p.weekday]} ${p.label ?? WORKOUT_KIND_LABEL[p.kind as WorkoutKind]}`,
          planned: 1,
          actual: done ? 1 : 0,
        })
      }
      actual = matched
      hasData = planned.length > 0
      unit = unit || 'séances du plan'
      detail = `${matched} / ${planned.length} séances du plan`
      break
    }
    case 'volume_km': {
      actual = volumeSummary(workouts, loadCtx).km
      unit = unit || 'km'
      break
    }
    case 'cardio_minutes': {
      actual = workouts
        .filter((w) => w.kind === 'cardio' || w.kind === 'course')
        .reduce((s, w) => s + (w.run?.durationSec ? w.run.durationSec / 60 : w.durationMin), 0)
      unit = unit || 'min'
      break
    }
    case 'volume_reps': {
      actual = goal.exerciseId ? exerciseVolume(goal.exerciseId, workouts, loadCtx).reps : 0
      unit = unit || 'reps'
      detail = ctx.exercises.find((e) => e.id === goal.exerciseId)?.name
      break
    }
    case 'volume_tonnage': {
      actual = goal.exerciseId ? exerciseVolume(goal.exerciseId, workouts, loadCtx).tonnage : 0
      unit = unit || 'kg'
      detail = ctx.exercises.find((e) => e.id === goal.exerciseId)?.name
      break
    }
    case 'performance': {
      /* Un record visé se mesure sur tout l'historique, pas sur la période. */
      const all = ctx.workouts.filter((w) => !w.deleted && !w.planned)
      const ref = ctx.references?.find((r) => r.exerciseId === goal.exerciseId)
      if (goal.exerciseId === RUN_5K_ID) {
        hasData = !!ref?.holdSec
        actual = ref?.holdSec ? ref.holdSec / 60 : 0
        unit = unit || 'min'
        detail = '5 km'
      } else if (goal.exerciseId) {
        const ex = ctx.exercises.find((e) => e.id === goal.exerciseId)
        const rec = exerciseRecords(goal.exerciseId, all, loadCtx)
        const hist = ex?.kind === 'static' ? rec.maxHoldSec : Math.max(rec.maxReps, rec.maxLoadKg)
        const typed = ex?.kind === 'static' ? (ref?.holdSec ?? 0) : (ref?.reps ?? 0)
        actual = Math.max(hist, typed)
        if (ex?.kind !== 'static' && (typed > 0 || rec.maxReps >= rec.maxLoadKg)) unit = unit || 'reps'
        else if (ex?.kind === 'static') unit = unit || 's'
        else unit = unit || 'kg'
        detail = ex?.name
        hasData = actual > 0
      } else {
        hasData = false
      }
      break
    }
    case 'sleep_hours': {
      const hs = checkins.map((c) => sleepHours(c)).filter((h): h is number => h !== null)
      hasData = hs.length > 0
      actual = hasData ? mean(hs) : 0
      unit = unit || 'h'
      break
    }
    case 'sleep_regularity': {
      const r = sleepRegularity(byDay, to)
      hasData = r !== null
      actual = r ?? 0
      unit = unit || '%'
      break
    }
    case 'sleep_nights_above': {
      const th = goal.threshold ?? 7
      actual = checkins.filter((c) => (sleepHours(c) ?? 0) >= th).length
      unit = unit || 'nuits'
      detail = `nuits ≥ ${th} h`
      break
    }
    case 'weight': {
      const ws = checkins.map((c) => c.weightKg).filter((v): v is number => !!v)
      hasData = ws.length > 0
      actual = hasData ? ws[ws.length - 1] : 0
      unit = unit || 'kg'
      break
    }
    case 'resting_hr': {
      const vs = checkins.map((c) => c.restingHr).filter((v): v is number => !!v)
      hasData = vs.length > 0
      actual = hasData ? mean(vs) : 0
      unit = unit || 'bpm'
      break
    }
    case 'hrv': {
      const vs = checkins.map((c) => c.hrv).filter((v): v is number => !!v)
      hasData = vs.length > 0
      actual = hasData ? mean(vs) : 0
      unit = unit || 'ms'
      break
    }
    case 'recovery_avg': {
      const vs = checkins.map((c) => c.recovery).filter((v): v is number => !!v)
      hasData = vs.length > 0
      actual = hasData ? mean(vs) : 0
      unit = unit || '%'
      break
    }
    case 'custom_metric': {
      const id = goal.customMetricId
      const vs = checkins
        .map((c) => (id ? c.custom?.[id] : undefined))
        .filter((v): v is number => typeof v === 'number')
      hasData = vs.length > 0
      actual = hasData ? mean(vs) : 0
      const m = ctx.customMetrics.find((x) => x.id === id)
      unit = unit || m?.unit || ''
      detail = m?.name
      break
    }
  }

  const target = goal.target
  let ratio: number
  if (goal.direction === 'max') {
    ratio = actual > 0 ? clamp(target / actual, 0, 1.5) : hasData ? 1.5 : 0
  } else {
    ratio = target > 0 ? clamp(actual / target, 0, 1.5) : 0
  }

  const status = statusFor(goal, ratio, hasData)
  return {
    goal,
    actual,
    target,
    ratio,
    status,
    label: unit,
    detail,
    series,
    matched,
  }
}

/** Période courante d'un objectif. */
export function goalPeriod(goal: Goal, day: DayKey, weekStartsOn: 0 | 1): { from: DayKey; to: DayKey } {
  if (goal.period === 'week') {
    const b = weekBounds(day, weekStartsOn)
    return { from: b.start, to: b.end }
  }
  const d = parseDay(day)
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from, to: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}` }
}

/** Part (0 → 1) de l'objectif tenue : moyenne des 4 dernières semaines terminées, ou du mois en cours. null = pas de données. */
export function goalScore(goal: Goal, ctx: GoalContext, today: DayKey): number | null {
  /* Semaines terminées d'abord : la semaine en cours n'est pas finie, elle ne doit pas faire baisser le score. */
  const ratios: number[] = []
  const offsets = goal.period === 'month' ? [0] : [1, 2, 3, 4]
  for (const i of offsets) {
    const anchor = addDayKey(today, -7 * i)
    const { from, to } = goalPeriod(goal, anchor, ctx.weekStartsOn)
    const p = evaluateGoal(goal, from, to, ctx)
    if (p.status === 'empty') continue
    ratios.push(clamp(p.ratio, 0, 1))
  }
  if (!ratios.length && goal.period === 'week') {
    const { from, to } = goalPeriod(goal, today, ctx.weekStartsOn)
    const p = evaluateGoal(goal, from, to, ctx)
    if (p.status !== 'empty') ratios.push(clamp(p.ratio, 0, 1))
  }
  return ratios.length ? mean(ratios) : null
}

/** Avancement (0 → 1) de la période en cours : ce que montre la carte de l'objectif. null = pas de données. */
export function goalCurrent(goal: Goal, ctx: GoalContext, today: DayKey): number | null {
  const { from, to } = goalPeriod(goal, today, ctx.weekStartsOn)
  const p = evaluateGoal(goal, from, to, ctx)
  return p.status === 'empty' ? null : clamp(p.ratio, 0, 1)
}

/**
 * Score du plan (0 → 100) : moyenne des objectifs actifs, pondérée par leur importance.
 * `current` : avancement de la semaine / du mois en cours (ce que montrent les cartes).
 * `average` : régularité sur les 4 dernières semaines terminées.
 */
export function alignmentScore(goals: Goal[], ctx: GoalContext, today: DayKey, mode: 'current' | 'average' = 'current'): number {
  let num = 0
  let den = 0
  for (const goal of goals.filter((g) => g.active && !g.deleted)) {
    const r = mode === 'current' ? goalCurrent(goal, ctx, today) : goalScore(goal, ctx, today)
    if (r === null) continue
    num += r * goal.weight
    den += goal.weight
  }
  return den > 0 ? Math.round((num / den) * 100) : 0
}

/** Phrase de bilan hebdomadaire, ton calme. */
export function weeklySentence(progress: GoalProgress[], alignment: number): string {
  const ok = progress.filter((p) => p.status === 'ok').length
  const total = progress.filter((p) => p.status !== 'empty').length
  if (!total) return 'Pas encore assez de données cette semaine. Ça viendra.'
  if (alignment >= 85) return `Semaine alignée : ${ok} objectifs sur ${total} tenus. Continue comme ça.`
  if (alignment >= 70) return `Semaine solide : ${ok} objectifs sur ${total} tenus. Le reste est à portée.`
  if (alignment >= 50)
    return `Semaine partielle : ${ok} sur ${total}. Rien d’inquiétant, un petit ajustement suffit.`
  return `Semaine légère : ${ok} sur ${total}. On repart tranquillement.`
}
