import type {
  CheckIn,
  CustomMetric,
  DayKey,
  ExerciseDef,
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
  let unit = goal.unit ?? ''

  switch (goal.kind) {
    case 'sessions_count': {
      actual = workouts.length
      unit = unit || 'séances'
      break
    }
    case 'sessions_by_kind': {
      actual = workouts.filter((w) => w.kind === goal.workoutKind).length
      unit = unit || 'séances'
      detail = goal.workoutKind ? WORKOUT_KIND_LABEL[goal.workoutKind] : undefined
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
      if (goal.exerciseId) {
        const ex = ctx.exercises.find((e) => e.id === goal.exerciseId)
        const rec = exerciseRecords(goal.exerciseId, all, loadCtx)
        actual = ex?.kind === 'static' ? rec.maxHoldSec : Math.max(rec.maxReps, rec.maxLoadKg)
        if (ex?.kind !== 'static' && rec.maxReps >= rec.maxLoadKg) unit = unit || 'reps'
        else if (ex?.kind === 'static') unit = unit || 's'
        else unit = unit || 'kg'
        detail = ex?.name
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

/**
 * Score Alignement : moyenne pondérée des objectifs actifs
 * sur 4 semaines glissantes (0 → 100).
 */
export function alignmentScore(goals: Goal[], ctx: GoalContext, today: DayKey): number {
  const active = goals.filter((g) => g.active && !g.deleted)
  if (!active.length) return 0
  let num = 0
  let den = 0
  for (const goal of active) {
    const ratios: number[] = []
    for (let i = 0; i < 4; i++) {
      const anchor = addDayKey(today, -7 * i)
      const { from, to } = goalPeriod(goal, anchor, ctx.weekStartsOn)
      const p = evaluateGoal(goal, from, to, ctx)
      if (p.status === 'empty') continue
      ratios.push(clamp(p.ratio, 0, 1))
      if (goal.period === 'month') break
    }
    if (!ratios.length) continue
    num += mean(ratios) * goal.weight
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
