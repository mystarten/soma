import type {
  CheckIn,
  DayKey,
  DayLoad,
  ExerciseDef,
  HrZones,
  LoadBalance,
  Workout,
} from '../types'
import { clamp, mean } from './stats'
import { dayRange, lastDays } from './time'
import { setTonnage } from './strength'

/* ──────────────────────────────────────────────────────────────────────────
   Charge d'entraînement, échelle 0 → 21 (comparable au Day Strain WHOOP).

   charge brute = durée × intensité^1.5 + 3 × volume relatif
   charge jour  = 21 × (1 − exp(−brute / K))
   ────────────────────────────────────────────────────────────────────────── */

export const LOAD_K = 62.5
export const LOAD_MAX = 21

export interface LoadContext {
  exercises: ExerciseDef[]
  bodyWeightKg: number
  hrZones?: HrZones
}

/** Intensité relative 0 → 1 : RPE si présent, sinon FC, sinon valeur par défaut. */
export function workoutIntensity(w: Workout, hrZones?: HrZones): number {
  if (typeof w.rpe === 'number' && w.rpe > 0) return clamp(w.rpe / 10, 0.1, 1)
  const avg = w.avgHr ?? w.run?.avgHr ?? w.cardio?.avgHr
  if (avg && hrZones?.maxHr) {
    const lo = hrZones.bounds[0] ?? 0.5 * hrZones.maxHr
    const hi = 0.95 * hrZones.maxHr
    return clamp((avg - lo) / Math.max(1, hi - lo), 0.2, 1)
  }
  if (typeof w.cardio?.intensity === 'number') return clamp(w.cardio.intensity / 10, 0.1, 1)
  if (typeof w.whoopStrain === 'number' && w.whoopStrain > 0) return clamp(w.whoopStrain / 18, 0.2, 1)
  return 0.6
}

/** Volume relatif d'une séance (somme des efforts normalisés des séries). */
export function workoutRelativeVolume(w: Workout, ctx: LoadContext): number {
  if (!w.sets?.length) return 0
  let total = 0
  for (const set of w.sets) {
    const ex = ctx.exercises.find((e) => e.id === set.exerciseId)
    if (!ex) continue
    if (ex.kind === 'static') {
      const ref = ex.referenceHoldSec ?? 30
      total += (set.holdSec ?? 0) / Math.max(1, ref)
    } else {
      const ref = ex.referenceReps ?? 20
      total += (set.reps ?? 0) / Math.max(1, ref)
    }
  }
  return total
}

/** Charge brute d'une séance (unités internes, avant compression 0 → 21). */
export function workoutRawLoad(w: Workout, ctx: LoadContext): number {
  const duration = w.run?.durationSec ? w.run.durationSec / 60 : w.durationMin
  const intensity = workoutIntensity(w, ctx.hrZones)
  const base = Math.max(0, duration) * intensity ** 1.5
  const volume = 3 * workoutRelativeVolume(w, ctx)
  /* Les minutes en zones 4-5 pèsent davantage. */
  const z = w.hrZoneMinutes
  const highZone = z ? (z[3] ?? 0) * 0.5 + (z[4] ?? 0) * 1 : 0
  return base + volume + highZone
}

/** Charge compressée d'une séance seule (indicative). */
export function workoutLoad(w: Workout, ctx: LoadContext): number {
  return LOAD_MAX * (1 - Math.exp(-workoutRawLoad(w, ctx) / LOAD_K))
}

/** Charge d'un jour : somme des charges brutes puis compression. */
export function dayLoad(
  day: DayKey,
  workouts: Workout[],
  checkins: Map<DayKey, CheckIn>,
  ctx: LoadContext,
): DayLoad {
  const whoop = checkins.get(day)?.whoopDayStrain
  const todays = workouts.filter((w) => w.day === day && !w.deleted && !w.planned)
  if (typeof whoop === 'number' && whoop > 0) {
    return {
      day,
      load: clamp(whoop, 0, LOAD_MAX),
      sources: todays.map((w) => ({ workoutId: w.id, load: workoutLoad(w, ctx) })),
    }
  }
  let raw = 0
  const sources: DayLoad['sources'] = []
  for (const w of todays) {
    const r = workoutRawLoad(w, ctx)
    raw += r
    sources.push({ workoutId: w.id, load: LOAD_MAX * (1 - Math.exp(-r / LOAD_K)) })
  }
  return { day, load: LOAD_MAX * (1 - Math.exp(-raw / LOAD_K)), sources }
}

export function dayLoadSeries(
  from: DayKey,
  to: DayKey,
  workouts: Workout[],
  checkins: CheckIn[],
  ctx: LoadContext,
): DayLoad[] {
  const map = new Map<DayKey, CheckIn>()
  for (const c of checkins) if (!c.deleted) map.set(c.day, c)
  return dayRange(from, to).map((d) => dayLoad(d, workouts, map, ctx))
}

/** Charge aiguë (7 j) contre chronique (28 j) et leur ratio. */
export function loadBalance(
  to: DayKey,
  workouts: Workout[],
  checkins: CheckIn[],
  ctx: LoadContext,
): LoadBalance {
  const map = new Map<DayKey, CheckIn>()
  for (const c of checkins) if (!c.deleted) map.set(c.day, c)
  const l7 = lastDays(to, 7).map((d) => dayLoad(d, workouts, map, ctx).load)
  const l28 = lastDays(to, 28).map((d) => dayLoad(d, workouts, map, ctx).load)
  const acute7 = mean(l7)
  const chronic28 = mean(l28)
  return { acute7, chronic28, ratio: chronic28 > 0.1 ? acute7 / chronic28 : 0 }
}

/* ── Volumes ──────────────────────────────────────────────────────────── */

export interface VolumeSummary {
  sessions: number
  minutes: number
  km: number
  reps: number
  holdSec: number
  tonnage: number
  elevationM: number
  byKind: Record<string, number>
}

export function volumeSummary(workouts: Workout[], ctx: LoadContext): VolumeSummary {
  const out: VolumeSummary = {
    sessions: 0,
    minutes: 0,
    km: 0,
    reps: 0,
    holdSec: 0,
    tonnage: 0,
    elevationM: 0,
    byKind: {},
  }
  for (const w of workouts) {
    if (w.deleted || w.planned) continue
    out.sessions += 1
    out.minutes += w.run?.durationSec ? w.run.durationSec / 60 : w.durationMin
    out.km += (w.run?.distanceM ?? w.cardio?.distanceM ?? 0) / 1000
    out.elevationM += w.run?.elevationGainM ?? 0
    out.byKind[w.kind] = (out.byKind[w.kind] ?? 0) + 1
    for (const set of w.sets ?? []) {
      const ex = ctx.exercises.find((e) => e.id === set.exerciseId)
      out.reps += set.reps ?? 0
      out.holdSec += set.holdSec ?? 0
      if (ex) out.tonnage += setTonnage(ex, set, ctx.bodyWeightKg)
    }
  }
  return out
}

/** Volume d'un exercice donné sur une liste de séances. */
export function exerciseVolume(
  exerciseId: string,
  workouts: Workout[],
  ctx: LoadContext,
): { reps: number; tonnage: number; sets: number; holdSec: number; best1RM: number } {
  const ex = ctx.exercises.find((e) => e.id === exerciseId)
  let reps = 0
  let tonnage = 0
  let sets = 0
  let holdSec = 0
  let best1RM = 0
  for (const w of workouts) {
    if (w.deleted || w.planned) continue
    for (const set of w.sets ?? []) {
      if (set.exerciseId !== exerciseId) continue
      sets += 1
      reps += set.reps ?? 0
      holdSec += set.holdSec ?? 0
      if (ex) {
        tonnage += setTonnage(ex, set, ctx.bodyWeightKg)
        const bwPart = (ex.bodyweightFactor ?? 0) * ctx.bodyWeightKg + (set.loadKg ?? 0)
        if ((set.reps ?? 0) > 0) {
          best1RM = Math.max(best1RM, bwPart * (1 + (set.reps ?? 0) / 30))
        }
      }
    }
  }
  return { reps, tonnage, sets, holdSec, best1RM }
}

/* ── Records ──────────────────────────────────────────────────────────── */

export interface ExerciseRecords {
  exerciseId: string
  maxReps: number
  maxLoadKg: number
  maxVolumeSession: number
  best1RM: number
  maxHoldSec: number
  at?: DayKey
}

export function exerciseRecords(
  exerciseId: string,
  workouts: Workout[],
  ctx: LoadContext,
): ExerciseRecords {
  const ex = ctx.exercises.find((e) => e.id === exerciseId)
  const rec: ExerciseRecords = {
    exerciseId,
    maxReps: 0,
    maxLoadKg: 0,
    maxVolumeSession: 0,
    best1RM: 0,
    maxHoldSec: 0,
  }
  for (const w of workouts) {
    if (w.deleted || w.planned) continue
    let sessionVolume = 0
    let touched = false
    for (const set of w.sets ?? []) {
      if (set.exerciseId !== exerciseId) continue
      touched = true
      rec.maxReps = Math.max(rec.maxReps, set.reps ?? 0)
      rec.maxLoadKg = Math.max(rec.maxLoadKg, set.loadKg ?? 0)
      rec.maxHoldSec = Math.max(rec.maxHoldSec, set.holdSec ?? 0)
      if (ex) {
        sessionVolume += setTonnage(ex, set, ctx.bodyWeightKg)
        const total = (ex.bodyweightFactor ?? 0) * ctx.bodyWeightKg + (set.loadKg ?? 0)
        if ((set.reps ?? 0) > 0) {
          const e = total * (1 + (set.reps ?? 0) / 30)
          if (e > rec.best1RM) {
            rec.best1RM = e
            rec.at = w.day
          }
        }
      }
    }
    if (touched) rec.maxVolumeSession = Math.max(rec.maxVolumeSession, sessionVolume)
  }
  return rec
}

/** Meilleur temps par distance (course). */
export function runRecords(workouts: Workout[]): {
  distanceM: number
  label: string
  durationSec: number
  day: DayKey
}[] {
  const targets = [
    { distanceM: 1000, label: '1 km' },
    { distanceM: 5000, label: '5 km' },
    { distanceM: 10000, label: '10 km' },
    { distanceM: 21097, label: 'Semi' },
    { distanceM: 42195, label: 'Marathon' },
  ]
  return targets
    .map((t) => {
      let best: { durationSec: number; day: DayKey } | null = null
      for (const w of workouts) {
        if (w.deleted || w.planned || !w.run) continue
        const d = w.run.distanceM ?? 0
        const sec = w.run.durationSec ?? w.durationMin * 60
        if (d < t.distanceM * 0.97 || sec <= 0) continue
        /* Temps estimé sur la distance exacte, au prorata. */
        const est = sec * (t.distanceM / d)
        if (!best || est < best.durationSec) best = { durationSec: est, day: w.day }
      }
      return best ? { ...t, ...best } : null
    })
    .filter((x): x is { distanceM: number; label: string; durationSec: number; day: DayKey } => !!x)
}
