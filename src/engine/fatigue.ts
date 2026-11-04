import type {
  BodyFatigue,
  CheckIn,
  DayKey,
  ExerciseDef,
  ExerciseReference,
  FatigueConfig,
  Iso,
  MuscleMix,
  MuscleZone,
  Workout,
  WorkoutTypeDef,
  ZoneFatigue,
} from '../types'
import { MUSCLE_ZONES } from '../types'
import { ZONE_SIZE } from './fatigueConfig'
import { CARDIO_MIX, KIND_FALLBACK_MIX, RUN_MIX, RUN_TYPE_INTENSITY, WORKOUT_KIND_LABEL } from './muscleMap'
import { computeSleepScore, sleepWindow } from './sleep'
import { clamp, mean } from './stats'
import { DAY_MS, HOUR_MS, addDayKey, dayKey, startOfHour, toDate, todayKey } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Moteur de fatigue — fonction pure, sans dépendance React ni réseau.

   1. Effort relatif par série (voir strength.ts)
   2. Répartition musculaire (muscleMap.ts)
   3. Charge de zone → fatigue initiale, courbe saturante
         E = V / k + w · P²       (V = volume relatif, P = pic d'intensité)
         F0 = 100 × (1 − exp(−E))
   4. Décroissance horaire : exp(−m / τ), m dépend du sommeil / de la récup
   5. Couleur continue (fatigueConfig.ts)
   ────────────────────────────────────────────────────────────────────────── */

import { setEffort } from './strength'

export interface FatigueContext {
  workouts: Workout[]
  checkins: CheckIn[]
  exercises: ExerciseDef[]
  workoutTypes?: WorkoutTypeDef[]
  bodyWeightKg: number
  references: ExerciseReference[]
  sleepGoalHours: number
  config: FatigueConfig
  /** Allure de référence sur 5 km, en s/km (pour l'intensité de course). */
  referencePaceSecPerKm?: number
}

type ZoneNums = Partial<Record<MuscleZone, number>>

interface Stimulus {
  /** Volume relatif par zone. */
  V: ZoneNums
  /** Pic d'intensité par zone (0 → 1). */
  P: ZoneNums
  label: string
}

const HORIZON_DAYS = 15
const LOOKBACK_DAYS = 25

/* ── 1 & 2. Stimulus d'une séance ─────────────────────────────────────── */

function addMix(target: ZoneNums, mix: MuscleMix, value: number, mode: 'sum' | 'max') {
  for (const [zoneRaw, coefRaw] of Object.entries(mix)) {
    const zone = zoneRaw as MuscleZone
    const coef = coefRaw ?? 0
    if (coef <= 0) continue
    const v = value * coef
    if (mode === 'sum') target[zone] = (target[zone] ?? 0) + v
    else target[zone] = Math.max(target[zone] ?? 0, v)
  }
}

function runIntensity(w: Workout, ctx: FatigueContext): number {
  const base = RUN_TYPE_INTENSITY[w.run?.runType ?? 'footing'] ?? 0.6
  let intensity = base
  if (typeof w.rpe === 'number' && w.rpe > 0) intensity = 0.45 * base + 0.55 * clamp(w.rpe / 10, 0, 1)
  const d = w.run?.distanceM
  const sec = w.run?.durationSec ?? w.durationMin * 60
  if (d && d > 400 && sec > 0 && ctx.referencePaceSecPerKm) {
    const pace = sec / (d / 1000)
    /* Plus l'allure est rapide que la référence, plus l'intensité monte. */
    intensity *= clamp(ctx.referencePaceSecPerKm / pace, 0.7, 1.3)
  }
  return clamp(intensity, 0.15, 1)
}

/** Facteur de pondération issu du strain WHOOP (1 = neutre). */
function strainFactor(w: Workout, config: FatigueConfig): number {
  const strain = w.whoopStrain
  if (typeof strain !== 'number' || strain <= 0 || config.whoopStrainWeight <= 0) return 1
  const rel = strain / 12
  return clamp(1 + config.whoopStrainWeight * (rel - 1), 0.6, 1.6)
}

export function workoutStimulus(w: Workout, ctx: FatigueContext): Stimulus {
  const { config } = ctx
  const V: ZoneNums = {}
  const P: ZoneNums = {}
  const names: string[] = []

  const sets = w.sets ?? []
  if (sets.length) {
    const byExercise = new Map<string, number>()
    for (const set of sets) {
      const ex = ctx.exercises.find((e) => e.id === set.exerciseId)
      if (!ex) continue
      const { effort, intensity } = setEffort(
        ex,
        set,
        { bodyWeightKg: ctx.bodyWeightKg, references: ctx.references },
        config.effortCap,
        config.failureBonus,
      )
      if (effort <= 0) continue
      addMix(V, ex.mix, effort, 'sum')
      addMix(P, ex.mix, intensity, 'max')
      byExercise.set(ex.name, (byExercise.get(ex.name) ?? 0) + 1)
    }
    for (const [name, n] of byExercise) names.push(n > 1 ? `${name} ×${n}` : name)
  }

  const durationMin = w.durationMin > 0 ? w.durationMin : 0

  if (w.kind === 'course' || w.run) {
    const sec = w.run?.durationSec ?? durationMin * 60
    const durationRel = clamp(sec / 60 / 90, 0, 3)
    const intensity = runIntensity(w, ctx)
    const effort = durationRel * intensity * config.runLoadPerMin
    addMix(V, RUN_MIX, effort, 'sum')
    addMix(P, RUN_MIX, clamp(intensity * Math.sqrt(durationRel), 0, 1), 'max')
    /* Bonus excentrique du dénivelé négatif. */
    const loss = w.run?.elevationLossM ?? 0
    if (loss > 0) {
      const bonus = (loss / 100) * config.downhillBonus
      addMix(V, { quadriceps: 1, ischios: 0.7, mollets: 0.5 }, bonus, 'sum')
    }
    if (!names.length) names.push(`Course ${(sec / 60).toFixed(0)} min`)
  } else if (w.kind === 'cardio' || w.cardio) {
    const mix = CARDIO_MIX[w.cardio?.modality ?? 'autre'] ?? CARDIO_MIX.autre
    const rawIntensity = w.cardio?.intensity ?? w.rpe ?? 5
    const intensity = clamp(rawIntensity / 10, 0.15, 1)
    const durationRel = clamp(durationMin / 90, 0, 3)
    const effort = durationRel * intensity * config.cardioLoadPerMin
    addMix(V, mix, effort, 'sum')
    addMix(P, mix, clamp(intensity * Math.sqrt(durationRel), 0, 1), 'max')
    if (!names.length) names.push(`${w.cardio?.modality ?? 'Cardio'} ${durationMin} min`)
  } else if (!sets.length) {
    /* Séance sans détail (import WHOOP, type personnalisé) : durée × RPE. */
    const typeDef = w.customTypeId ? ctx.workoutTypes?.find((t) => t.id === w.customTypeId) : undefined
    const mix = w.fallbackMix ?? typeDef?.mix ?? KIND_FALLBACK_MIX[w.kind] ?? KIND_FALLBACK_MIX.custom
    const intensity = clamp((w.rpe ?? 6) / 10, 0.15, 1)
    const durationRel = clamp(durationMin / 90, 0, 3)
    const effort = durationRel * intensity * (typeDef?.loadFactor ?? 2)
    addMix(V, mix, effort, 'sum')
    addMix(P, mix, clamp(intensity * Math.sqrt(durationRel), 0, 1), 'max')
    if (!names.length) names.push(`${WORKOUT_KIND_LABEL[w.kind]} ${durationMin} min`)
  }

  const sf = strainFactor(w, config)
  if (sf !== 1) {
    for (const z of Object.keys(V) as MuscleZone[]) V[z] = (V[z] ?? 0) * sf
    for (const z of Object.keys(P) as MuscleZone[]) P[z] = clamp((P[z] ?? 0) * sf, 0, 1)
  }

  return { V, P, label: w.title || names.slice(0, 3).join(' · ') || WORKOUT_KIND_LABEL[w.kind] }
}

/* ── 3. Exposant initial par zone ─────────────────────────────────────── */

function zoneExponent(zone: MuscleZone, v: number, p: number, config: FatigueConfig): number {
  const size = ZONE_SIZE[zone]
  return v / config.k[size] + config.peakWeight * p * p
}

export function fatigueFromExponent(exponent: number): number {
  return clamp(100 * (1 - Math.exp(-Math.max(0, exponent))), 0, 100)
}

/* ── 4. Chronologie des multiplicateurs de récupération ───────────────── */

interface Timeline {
  from: number
  /** cum[i] = somme des multiplicateurs sur les heures [from, from + i·1 h). */
  cum: Float64Array
}

interface SleepSlot {
  start: number
  end: number
  m: number
}

function buildTimeline(from: number, to: number, ctx: FatigueContext): Timeline {
  const { config, sleepGoalHours } = ctx
  const byDay = new Map<DayKey, CheckIn>()
  for (const c of ctx.checkins) if (!c.deleted) byDay.set(c.day, c)

  const today = todayKey()
  const slots: SleepSlot[] = []
  const recoveryByDay = new Map<DayKey, number>()

  const firstDay = addDayKey(dayKey(from), -1)
  const lastDay = addDayKey(dayKey(to), 1)
  for (let d = firstDay; d <= lastDay; d = addDayKey(d, 1)) {
    const c = byDay.get(d)
    if (typeof c?.recovery === 'number') recoveryByDay.set(d, c.recovery)
    const win = sleepWindow(c, d)
    if (win) {
      const score = computeSleepScore(byDay, d, sleepGoalHours).score
      const m =
        config.sleepMultiplier.min +
        (config.sleepMultiplier.max - config.sleepMultiplier.min) * clamp(score / 100, 0, 1)
      slots.push({ ...win, m })
    } else if (d > today) {
      /* Projection : nuit moyenne de 8 h, 23 h → 7 h. */
      const [y, mo, dd] = addDayKey(d, -1).split('-').map(Number)
      const start = new Date(y, mo - 1, dd, 23, 0, 0, 0).getTime()
      const mid = 0.75
      slots.push({
        start,
        end: start + 8 * HOUR_MS,
        m:
          config.sleepMultiplier.min +
          (config.sleepMultiplier.max - config.sleepMultiplier.min) * mid,
      })
    }
    /* Nuit passée sans données : m = 1 (neutre), géré par défaut ci-dessous. */
  }
  slots.sort((a, b) => a.start - b.start)

  const start = startOfHour(from)
  const hours = Math.max(1, Math.ceil((to - start) / HOUR_MS) + 1)
  const cum = new Float64Array(hours + 1)
  let si = 0
  for (let i = 0; i < hours; i++) {
    const h0 = start + i * HOUR_MS
    const h1 = h0 + HOUR_MS
    while (si < slots.length && slots[si].end <= h0) si++
    let m: number | null = null
    for (let j = si; j < slots.length && slots[j].start < h1; j++) {
      const overlap = Math.min(h1, slots[j].end) - Math.max(h0, slots[j].start)
      if (overlap >= HOUR_MS / 2) {
        m = slots[j].m
        break
      }
    }
    if (m === null) {
      const rec = recoveryByDay.get(dayKey(h0))
      m =
        typeof rec === 'number'
          ? config.awakeMultiplier.min +
            (config.awakeMultiplier.max - config.awakeMultiplier.min) * clamp(rec / 100, 0, 1)
          : 1
    }
    cum[i + 1] = cum[i] + m
  }
  return { from: start, cum }
}

function cumAt(tl: Timeline, t: number): number {
  const x = (t - tl.from) / HOUR_MS
  if (x <= 0) return 0
  const last = tl.cum.length - 1
  if (x >= last) return tl.cum[last]
  const i = Math.floor(x)
  return tl.cum[i] + (tl.cum[i + 1] - tl.cum[i]) * (x - i)
}

/* ── Préparation (réutilisable pour l'animation temporelle) ───────────── */

export interface PreparedEntry {
  workout: Workout
  start: number
  label: string
  /** Exposant initial par zone, majoration de surcharge incluse. */
  E: ZoneNums
  V: ZoneNums
}

export interface PreparedFatigue {
  entries: PreparedEntry[]
  timeline: Timeline
  config: FatigueConfig
  /** Volume par zone sur 7 j / moyenne 7 j sur 28 j, calculés à `anchor`. */
  anchor: number
}

export function prepareFatigue(
  ctx: FatigueContext,
  at: number | Date | Iso,
  until?: number,
): PreparedFatigue {
  const anchor = toDate(at).getTime()
  const to = until ?? anchor + HORIZON_DAYS * DAY_MS
  const windowStart = anchor - LOOKBACK_DAYS * DAY_MS

  const relevant = ctx.workouts
    .filter((w) => !w.deleted && !w.planned)
    .map((w) => ({ w, start: toDate(w.startedAt).getTime() }))
    .filter((e) => e.start >= windowStart - 28 * DAY_MS && e.start <= to)
    .sort((a, b) => a.start - b.start)

  const stimuli = relevant.map((e) => ({ ...e, s: workoutStimulus(e.w, ctx) }))

  const entries: PreparedEntry[] = []
  for (let i = 0; i < stimuli.length; i++) {
    const { w, start, s } = stimuli[i]
    if (start < windowStart) continue
    const E: ZoneNums = {}
    for (const zone of MUSCLE_ZONES) {
      const v = s.V[zone] ?? 0
      const p = s.P[zone] ?? 0
      if (v <= 0 && p <= 0) continue
      let e = zoneExponent(zone, v, p, ctx.config)
      /* Majoration « beaucoup pour mon niveau » : charge de zone > ratio × moyenne 4 semaines. */
      const past: number[] = []
      for (let j = 0; j < i; j++) {
        if (stimuli[j].start >= start - 28 * DAY_MS && stimuli[j].start < start) {
          const pv = stimuli[j].s.V[zone] ?? 0
          if (pv > 0) past.push(pv)
        }
      }
      if (past.length >= 3 && v > ctx.config.overreachRatio * mean(past)) {
        e *= 1 + ctx.config.overreachBonus
      }
      if (e > 0) E[zone] = e
    }
    if (Object.keys(E).length) entries.push({ workout: w, start, label: s.label, E, V: s.V })
  }

  const from = entries.length ? Math.min(...entries.map((e) => e.start)) : anchor - DAY_MS
  const timeline = buildTimeline(Math.min(from, anchor) - HOUR_MS, to + HOUR_MS, ctx)
  return { entries, timeline, config: ctx.config, anchor }
}

/* ── Évaluation ───────────────────────────────────────────────────────── */

function emptyZone(zone: MuscleZone): ZoneFatigue {
  return {
    zone,
    value: 0,
    hasHistory: false,
    readyInHours: 0,
    contributors: [],
    load7d: 0,
    load28dAvg7d: 0,
  }
}

function evaluate(prepared: PreparedFatigue, t: number): Record<MuscleZone, number> {
  const out = {} as Record<MuscleZone, number>
  const exp = {} as Record<MuscleZone, number>
  for (const z of MUSCLE_ZONES) exp[z] = 0
  const ct = cumAt(prepared.timeline, t)
  for (const entry of prepared.entries) {
    if (entry.start > t) continue
    const dm = ct - cumAt(prepared.timeline, entry.start)
    for (const zoneRaw of Object.keys(entry.E) as MuscleZone[]) {
      const tau = prepared.config.tau[ZONE_SIZE[zoneRaw]]
      exp[zoneRaw] += (entry.E[zoneRaw] ?? 0) * Math.exp(-dm / tau)
    }
  }
  for (const z of MUSCLE_ZONES) out[z] = fatigueFromExponent(exp[z])
  return out
}

/** Fatigue brute par zone à l'instant `t` (sans détails ni contributeurs). */
export function fatigueValuesAt(
  prepared: PreparedFatigue,
  t: number | Date | Iso,
): Record<MuscleZone, number> {
  return evaluate(prepared, toDate(t).getTime())
}

/** Nombre d'heures avant de repasser sous le seuil « prêt ». */
function readyIn(prepared: PreparedFatigue, zone: MuscleZone, t: number, current: number): number | null {
  const threshold = prepared.config.readyThreshold
  if (current <= threshold) return 0
  for (let h = 1; h <= HORIZON_DAYS * 24; h++) {
    const v = evaluateZone(prepared, zone, t + h * HOUR_MS)
    if (v <= threshold) return h
  }
  return null
}

function evaluateZone(prepared: PreparedFatigue, zone: MuscleZone, t: number): number {
  const tau = prepared.config.tau[ZONE_SIZE[zone]]
  const ct = cumAt(prepared.timeline, t)
  let e = 0
  for (const entry of prepared.entries) {
    if (entry.start > t) continue
    const contrib = entry.E[zone]
    if (!contrib) continue
    e += contrib * Math.exp(-(ct - cumAt(prepared.timeline, entry.start)) / tau)
  }
  return fatigueFromExponent(e)
}

/**
 * État complet du corps à l'instant `t`.
 * Fonction pure : mêmes entrées → mêmes sorties.
 */
export function fatigueAt(
  t: number | Date | Iso,
  ctx: FatigueContext,
  prepared?: PreparedFatigue,
): BodyFatigue {
  const time = toDate(t).getTime()
  const prep = prepared ?? prepareFatigue(ctx, time)
  const values = evaluate(prep, time)
  const ct = cumAt(prep.timeline, time)

  const body = {} as BodyFatigue
  for (const zone of MUSCLE_ZONES) {
    const z = emptyZone(zone)
    const tau = prep.config.tau[ZONE_SIZE[zone]]
    const contributors: ZoneFatigue['contributors'] = []
    let load7 = 0
    let load28 = 0
    let touched = false
    for (const entry of prep.entries) {
      const v = entry.V[zone] ?? 0
      if (v > 0) {
        touched = true
        const ageDays = (time - entry.start) / DAY_MS
        if (ageDays >= 0 && ageDays < 7) load7 += v
        if (ageDays >= 0 && ageDays < 28) load28 += v
      }
      if (entry.start > time) continue
      const e = entry.E[zone]
      if (!e) continue
      const decayed = e * Math.exp(-(ct - cumAt(prep.timeline, entry.start)) / tau)
      if (decayed > 0.06) {
        contributors.push({
          workoutId: entry.workout.id,
          startedAt: entry.workout.startedAt as Iso,
          label: entry.label,
          load: Math.round(fatigueFromExponent(decayed)),
        })
      }
    }
    z.value = values[zone]
    z.hasHistory = touched
    z.contributors = contributors.sort((a, b) => b.load - a.load).slice(0, 6)
    z.load7d = load7
    z.load28dAvg7d = (load28 * 7) / 28
    z.readyInHours = touched ? readyIn(prep, zone, time, z.value) : 0
    body[zone] = z
  }
  return body
}

/** Moyenne pondérée des zones → score de disponibilité (100 = tout frais). */
export function availabilityScore(body: BodyFatigue): number {
  const weights: Partial<Record<MuscleZone, number>> = {
    dorsaux: 1.2,
    pectoraux: 1.2,
    quadriceps: 1.2,
    ischios: 1,
    fessiers: 1,
    lombaires: 1,
    triceps: 0.9,
    biceps: 0.9,
    deltoides_ant: 0.9,
    deltoides_post: 0.8,
    haut_dos: 0.9,
    trapezes: 0.7,
    avantbras: 0.7,
    abdos: 0.7,
    obliques: 0.5,
    adducteurs: 0.5,
    mollets: 0.9,
    tibias: 0.5,
  }
  let num = 0
  let den = 0
  for (const zone of MUSCLE_ZONES) {
    const w = weights[zone] ?? 1
    num += (100 - body[zone].value) * w
    den += w
  }
  return den ? clamp(num / den, 0, 100) : 100
}

/** Zones disponibles / à ménager. */
export function bodySummary(body: BodyFatigue): { ready: MuscleZone[]; careful: MuscleZone[] } {
  const ready: MuscleZone[] = []
  const careful: MuscleZone[] = []
  for (const zone of MUSCLE_ZONES) {
    const v = body[zone].value
    if (v < 35) ready.push(zone)
    else if (v >= 55) careful.push(zone)
  }
  ready.sort((a, b) => body[a].value - body[b].value)
  careful.sort((a, b) => body[b].value - body[a].value)
  return { ready, careful }
}
