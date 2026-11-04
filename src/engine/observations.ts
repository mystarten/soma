import type {
  CheckIn,
  DayKey,
  ExerciseDef,
  HrZones,
  Observation,
  Workout,
} from '../types'
import { mean, stdev } from './stats'
import { addDayKey, lastDays, toDate } from './time'
import { sleepDebtHours, sleepHours } from './sleep'
import { dayLoad, exerciseRecords, volumeSummary } from './load'

/* ──────────────────────────────────────────────────────────────────────────
   Suivi de fond — règles prédéfinies, aucune IA.

   Une observation n'apparaît que si la tendance DURE :
     moyenne mobile 7 jours vs base personnelle 28 jours,
     écart > 1 écart type, pendant au moins 5 jours d'affilée.
   Un jour isolé ne déclenche jamais rien.
   ────────────────────────────────────────────────────────────────────────── */

export const TREND_MIN_CONSECUTIVE_DAYS = 5
export const TREND_SD_FACTOR = 1

export interface SeriesPoint {
  day: DayKey
  value: number | null
}

export interface TrendResult {
  active: boolean
  consecutiveDays: number
  recent7: number | null
  baseline28: number | null
  sd28: number
  delta: number
}

/** Détection d'une déviation soutenue d'une série quotidienne. */
export function detectSustainedDeviation(
  series: SeriesPoint[],
  direction: 'up' | 'down',
  opts: { minDays?: number; sdFactor?: number; minAbsDelta?: number } = {},
): TrendResult {
  const minDays = opts.minDays ?? TREND_MIN_CONSECUTIVE_DAYS
  const sdFactor = opts.sdFactor ?? TREND_SD_FACTOR
  const empty: TrendResult = {
    active: false,
    consecutiveDays: 0,
    recent7: null,
    baseline28: null,
    sd28: 0,
    delta: 0,
  }
  if (series.length < 14) return empty

  const valueAt = (i: number) => series[i]?.value ?? null
  const windowMean = (end: number, size: number) => {
    const vals: number[] = []
    for (let i = Math.max(0, end - size + 1); i <= end; i++) {
      const v = valueAt(i)
      if (v !== null && Number.isFinite(v)) vals.push(v)
    }
    return vals.length >= Math.ceil(size / 3) ? { m: mean(vals), sd: stdev(vals), n: vals.length } : null
  }

  let consecutive = 0
  let last: { recent7: number; baseline28: number; sd28: number } | null = null
  for (let i = series.length - 1; i >= 13; i--) {
    const w7 = windowMean(i, 7)
    const w28 = windowMean(i, 28)
    if (!w7 || !w28 || w28.n < 10) break
    const sd = Math.max(w28.sd, 0.0001)
    const flagged =
      direction === 'down'
        ? w7.m < w28.m - sdFactor * sd
        : w7.m > w28.m + sdFactor * sd
    const absOk =
      opts.minAbsDelta === undefined || Math.abs(w7.m - w28.m) >= opts.minAbsDelta
    if (!flagged || !absOk) break
    consecutive += 1
    if (!last) last = { recent7: w7.m, baseline28: w28.m, sd28: sd }
  }

  if (!last) return empty
  return {
    active: consecutive >= minDays,
    consecutiveDays: consecutive,
    recent7: last.recent7,
    baseline28: last.baseline28,
    sd28: last.sd28,
    delta: last.recent7 - last.baseline28,
  }
}

export interface ObservationContext {
  checkins: CheckIn[]
  workouts: Workout[]
  exercises: ExerciseDef[]
  bodyWeightKg: number
  sleepGoalHours: number
  hrZones?: HrZones
  today: DayKey
}

function buildSeries(
  ctx: ObservationContext,
  days: DayKey[],
  pick: (c: CheckIn | undefined, day: DayKey) => number | null,
): SeriesPoint[] {
  const byDay = new Map<DayKey, CheckIn>()
  for (const c of ctx.checkins) if (!c.deleted) byDay.set(c.day, c)
  return days.map((day) => ({ day, value: pick(byDay.get(day), day) }))
}

const SLOTS: { id: string; label: string; from: number; to: number }[] = [
  { id: 'matin', label: 'le matin', from: 5, to: 10 },
  { id: 'midi', label: 'à la pause de midi', from: 11, to: 14 },
  { id: 'apresmidi', label: 'en milieu d’après-midi', from: 15, to: 18 },
  { id: 'soir', label: 'en soirée', from: 19, to: 23 },
]

/** Toutes les observations candidates, triées. Afficher au maximum 3. */
export function computeObservations(ctx: ObservationContext): Observation[] {
  const out: Observation[] = []
  const days = lastDays(ctx.today, 42)
  const byDay = new Map<DayKey, CheckIn>()
  for (const c of ctx.checkins) if (!c.deleted) byDay.set(c.day, c)

  /* 1. Récupération moyenne en baisse. */
  const recovery = buildSeries(ctx, days, (c) => c?.recovery ?? null)
  const recTrend = detectSustainedDeviation(recovery, 'down', { minAbsDelta: 4 })
  if (recTrend.active) {
    out.push({
      id: 'recovery_down',
      level: 'note',
      title: 'Récupération en baisse',
      sentence: `Ta récupération tourne à ${Math.round(recTrend.recent7!)} % sur 7 jours, contre ${Math.round(
        recTrend.baseline28!,
      )} % d’habitude. Ça dure depuis ${recTrend.consecutiveDays} jours.`,
      series: recovery.slice(-28).map((p) => ({ day: p.day, value: p.value ?? 0 })),
      baseline: recTrend.baseline28!,
      metricLabel: 'Récupération %',
      score: 80 + Math.min(20, -recTrend.delta),
    })
  }

  /* 2. Dette de sommeil qui s'accumule. */
  const debt = buildSeries(ctx, days, (_c, day) => sleepDebtHours(byDay, day, ctx.sleepGoalHours))
  const debtTrend = detectSustainedDeviation(debt, 'up', { minAbsDelta: 1.5 })
  const currentDebt = sleepDebtHours(byDay, ctx.today, ctx.sleepGoalHours)
  if (debtTrend.active && currentDebt >= 3) {
    out.push({
      id: 'sleep_debt',
      level: 'note',
      title: 'Dette de sommeil',
      sentence: `Environ ${currentDebt.toFixed(1)} h de retard de sommeil sur 7 jours. Une nuit longue suffirait à en reprendre une bonne partie.`,
      series: debt.slice(-28).map((p) => ({ day: p.day, value: p.value ?? 0 })),
      baseline: debtTrend.baseline28!,
      metricLabel: 'Dette (h)',
      score: 70 + Math.min(20, currentDebt),
    })
  }

  /* 3. FC repos en hausse ET HRV en baisse sur 7 jours. */
  const rhr = buildSeries(ctx, days, (c) => c?.restingHr ?? null)
  const hrv = buildSeries(ctx, days, (c) => c?.hrv ?? null)
  const rhrTrend = detectSustainedDeviation(rhr, 'up', { minDays: 7, minAbsDelta: 2 })
  const hrvTrend = detectSustainedDeviation(hrv, 'down', { minDays: 7 })
  if (rhrTrend.active && hrvTrend.active) {
    const hrvPct = hrvTrend.baseline28 ? (hrvTrend.delta / hrvTrend.baseline28) * 100 : 0
    const severe = rhrTrend.delta >= 5 && hrvPct <= -20
    out.push({
      id: 'rhr_hrv',
      level: severe ? 'watch' : 'note',
      title: 'FC de repos et HRV divergent',
      sentence: `FC de repos +${rhrTrend.delta.toFixed(1)} bpm et HRV ${hrvPct.toFixed(0)} % par rapport à ta base, depuis 7 jours.${
        severe ? ' Une semaine plus calme serait bienvenue.' : ''
      }`,
      series: rhr.slice(-28).map((p) => ({ day: p.day, value: p.value ?? 0 })),
      baseline: rhrTrend.baseline28!,
      metricLabel: 'FC repos (bpm)',
      score: severe ? 100 : 75,
    })
  }

  /* 4. Charge aiguë durablement au-dessus de la charge chronique. */
  const loadSeries = buildSeries(ctx, days, (_c, day) =>
    dayLoad(day, ctx.workouts, byDay, {
      exercises: ctx.exercises,
      bodyWeightKg: ctx.bodyWeightKg,
      hrZones: ctx.hrZones,
    }).load,
  )
  const loadTrend = detectSustainedDeviation(loadSeries, 'up', { minAbsDelta: 1.5 })
  if (loadTrend.active) {
    out.push({
      id: 'load_up',
      level: 'note',
      title: 'Charge en hausse',
      sentence: `Charge moyenne à ${loadTrend.recent7!.toFixed(1)} sur 7 jours, contre ${loadTrend.baseline28!.toFixed(
        1,
      )} d’habitude. C’est une montée, pas un problème — garde une journée légère sous la main.`,
      series: loadSeries.slice(-28).map((p) => ({ day: p.day, value: p.value ?? 0 })),
      baseline: loadTrend.baseline28!,
      metricLabel: 'Charge /21',
      score: 65,
    })
  }

  /* 5. Plateau sur un exercice. */
  const plateau = detectPlateau(ctx)
  if (plateau) out.push(plateau)

  /* 6. Meilleur créneau pour une séance dure. */
  const slot = bestSlot(ctx)
  if (slot) out.push(slot)

  /* 7. Progression tranquille : une note positive quand tout va bien. */
  const recTrendUp = detectSustainedDeviation(recovery, 'up', { minAbsDelta: 4 })
  if (recTrendUp.active) {
    out.push({
      id: 'recovery_up',
      level: 'info',
      title: 'Récupération en hausse',
      sentence: `Récupération à ${Math.round(recTrend.recent7 ?? recTrendUp.recent7!)} % sur 7 jours, au-dessus de ta base. C’est le bon moment pour une séance exigeante.`,
      series: recovery.slice(-28).map((p) => ({ day: p.day, value: p.value ?? 0 })),
      baseline: recTrendUp.baseline28!,
      metricLabel: 'Récupération %',
      score: 60,
    })
  }

  return out.sort((a, b) => b.score - a.score)
}

/** Plateau : aucun record sur un exercice pratiqué régulièrement depuis N séances. */
export function detectPlateau(ctx: ObservationContext, minSessions = 5): Observation | null {
  const loadCtx = { exercises: ctx.exercises, bodyWeightKg: ctx.bodyWeightKg }
  const recent = ctx.workouts
    .filter((w) => !w.deleted && !w.planned && w.day >= addDayKey(ctx.today, -90))
    .sort((a, b) => a.day.localeCompare(b.day))

  const counts = new Map<string, Workout[]>()
  for (const w of recent) {
    for (const s of w.sets ?? []) {
      const list = counts.get(s.exerciseId) ?? []
      if (!list.includes(w)) list.push(w)
      counts.set(s.exerciseId, list)
    }
  }

  let best: Observation | null = null
  for (const [exerciseId, sessions] of counts) {
    if (sessions.length < minSessions + 2) continue
    const ex = ctx.exercises.find((e) => e.id === exerciseId)
    if (!ex) continue
    const metric = (w: Workout) => {
      const r = exerciseRecords(exerciseId, [w], loadCtx)
      return ex.kind === 'static' ? r.maxHoldSec : Math.max(r.best1RM, r.maxReps)
    }
    const values = sessions.map(metric)
    const olderBest = Math.max(...values.slice(0, values.length - minSessions))
    const recentBest = Math.max(...values.slice(-minSessions))
    if (recentBest <= olderBest * 1.005) {
      const score = 55 + Math.min(10, sessions.length)
      if (!best || score > best.score) {
        best = {
          id: `plateau_${exerciseId}`,
          level: 'info',
          title: `Plateau sur ${ex.name}`,
          sentence: `Pas de nouveau record sur ${ex.name} depuis ${minSessions} séances. Varier le lest, le tempo ou le nombre de séries débloque souvent la suite.`,
          series: sessions.map((w, i) => ({ day: w.day, value: values[i] })),
          metricLabel: ex.kind === 'static' ? 'Tenue max (s)' : 'Meilleure série',
          score,
        }
      }
    }
  }
  return best
}

/** Créneau horaire historiquement le plus favorable pour une séance dure. */
export function bestSlot(ctx: ObservationContext): Observation | null {
  const byDay = new Map<DayKey, CheckIn>()
  for (const c of ctx.checkins) if (!c.deleted) byDay.set(c.day, c)
  const stats = new Map<string, number[]>()
  for (const w of ctx.workouts) {
    if (w.deleted || w.planned) continue
    if ((w.rpe ?? 0) < 7 && !w.whoopStrain) continue
    const hour = toDate(w.startedAt).getHours()
    const slot = SLOTS.find((s) => hour >= s.from && hour <= s.to)
    if (!slot) continue
    const next = byDay.get(addDayKey(w.day, 1))
    if (typeof next?.recovery !== 'number') continue
    const list = stats.get(slot.id) ?? []
    list.push(next.recovery)
    stats.set(slot.id, list)
  }
  const scored = [...stats.entries()]
    .filter(([, v]) => v.length >= 3)
    .map(([id, v]) => ({ id, avg: mean(v), n: v.length }))
    .sort((a, b) => b.avg - a.avg)
  if (scored.length < 2) return null
  const top = scored[0]
  const bottom = scored[scored.length - 1]
  if (top.avg - bottom.avg < 5) return null
  const slot = SLOTS.find((s) => s.id === top.id)!
  return {
    id: 'best_slot',
    level: 'info',
    title: 'Ton meilleur créneau',
    sentence: `Après une séance dure ${slot.label}, ta récupération du lendemain est à ${Math.round(
      top.avg,
    )} % en moyenne, soit ${Math.round(top.avg - bottom.avg)} points de mieux que ton pire créneau.`,
    series: scored.map((s) => ({ day: s.id, value: s.avg })),
    metricLabel: 'Récup. J+1 (%)',
    score: 50,
  }
}

/** Bilan hebdomadaire automatique (généré le lundi). */
export function weeklyDigest(ctx: ObservationContext): string[] {
  const lines: string[] = []
  const loadCtx = {
    exercises: ctx.exercises,
    bodyWeightKg: ctx.bodyWeightKg,
    hrZones: ctx.hrZones,
  }
  const week = lastDays(ctx.today, 7)
  const prev = lastDays(addDayKey(ctx.today, -7), 7)
  const inWeek = (ds: DayKey[]) =>
    ctx.workouts.filter((w) => !w.deleted && !w.planned && ds.includes(w.day))

  const cur = volumeSummary(inWeek(week), loadCtx)
  const old = volumeSummary(inWeek(prev), loadCtx)
  lines.push(
    `${cur.sessions} séance${cur.sessions > 1 ? 's' : ''} cette semaine (${old.sessions} la précédente), ${Math.round(
      cur.minutes,
    )} min au total.`,
  )
  if (cur.km > 0.5) lines.push(`${cur.km.toFixed(1)} km courus, ${Math.round(cur.elevationM)} m de dénivelé.`)

  const recs = week
    .map((d) => ctx.checkins.find((c) => c.day === d && !c.deleted)?.recovery)
    .filter((v): v is number => typeof v === 'number')
  if (recs.length)
    lines.push(`Récupération moyenne ${Math.round(mean(recs))} % sur ${recs.length} jours notés.`)

  const hs = week
    .map((d) => sleepHours(ctx.checkins.find((c) => c.day === d && !c.deleted)))
    .filter((v): v is number => v !== null)
  if (hs.length) {
    const avg = mean(hs)
    lines.push(
      `Sommeil moyen ${avg.toFixed(1)} h (objectif ${ctx.sleepGoalHours} h), dette ${sleepDebtHours(
        new Map(ctx.checkins.filter((c) => !c.deleted).map((c) => [c.day, c])),
        ctx.today,
        ctx.sleepGoalHours,
      ).toFixed(1)} h.`,
    )
  }
  return lines
}

/** Journée où une tendance est la plus marquée, pour positionner un repère. */
export function trendBadge(trend: TrendResult): string {
  if (!trend.active) return ''
  const sign = trend.delta > 0 ? '+' : ''
  return `${sign}${trend.delta.toFixed(1)} vs base (${trend.consecutiveDays} j)`
}

export const LEVEL_LABEL: Record<Observation['level'], string> = {
  info: 'Info',
  note: 'À noter',
  watch: 'À surveiller',
}

export const LEVEL_COLOR: Record<Observation['level'], string> = {
  info: '#35e3ff',
  note: '#ffc24b',
  watch: '#ff8f45',
}

export function visibleObservations(all: Observation[], max = 3): Observation[] {
  return all.slice(0, max)
}


