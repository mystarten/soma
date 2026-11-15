import type { CheckIn, DayKey, ExerciseDef, Workout } from '../types'
import { addDayKey, lastDays } from './time'
import { clamp, mean } from './stats'
import { sleepDebtHours, sleepHours } from './sleep'
import { exerciseRecords, loadBalance, type LoadContext } from './load'

/* ──────────────────────────────────────────────────────────────────────────
   Charge de fond : à quel point le corps est fatigué sur la durée (pas ce matin).
   Cinq signaux, chacun de 0 (aucun stress) à 100 (net) :
   charge d'entraînement, récupération, VFC / FC de repos, dette de sommeil, performances.
   Un signal manquant est écarté et les autres sont repondérés.
   ────────────────────────────────────────────────────────────────────────── */

export interface OverloadComponent {
  key: 'load' | 'recovery' | 'hrv' | 'sleep' | 'perf'
  label: string
  /** 0 → 100, null si pas assez de données. */
  score: number | null
  weight: number
  detail: string
}

export type OverloadLevel = 'ok' | 'watch' | 'deload'

export interface OverloadResult {
  day: DayKey
  /** 0 → 100, null si moins de deux signaux disponibles. */
  score: number | null
  level: OverloadLevel
  components: OverloadComponent[]
  /** Les signaux qui pèsent le plus, en phrases. */
  drivers: string[]
}

export interface OverloadContext {
  byDay: Map<DayKey, CheckIn>
  checkins: CheckIn[]
  workouts: Workout[]
  exercises: ExerciseDef[]
  loadCtx: LoadContext
  sleepGoal: number
  /** Seuil de décharge, 80 par défaut. */
  threshold?: number
}

const WEIGHTS = { load: 0.3, recovery: 0.2, hrv: 0.2, sleep: 0.15, perf: 0.15 } as const

const avgOf = (days: DayKey[], byDay: Map<DayKey, CheckIn>, pick: (c: CheckIn) => number | null | undefined, min: number): number | null => {
  const v = days.map((d) => { const c = byDay.get(d); return c ? pick(c) : null }).filter((x): x is number => typeof x === 'number' && x > 0)
  return v.length >= min ? mean(v) : null
}

const scale = (x: number, from: number, to: number) => clamp(((x - from) / (to - from)) * 100, 0, 100)

/** Évolution des performances (1RM, tenues, répétitions) : 2 dernières semaines contre les 4 d'avant. */
export function performanceChange(day: DayKey, workouts: Workout[], exercises: ExerciseDef[], loadCtx: LoadContext): { change: number; n: number } | null {
  const recentFrom = addDayKey(day, -13)
  const beforeFrom = addDayKey(day, -41)
  const recent = workouts.filter((w) => !w.deleted && !w.backfill && w.day >= recentFrom && w.day <= day)
  const before = workouts.filter((w) => !w.deleted && !w.backfill && w.day >= beforeFrom && w.day < recentFrom)
  const ids = new Set<string>()
  for (const w of recent) for (const s of w.sets ?? []) ids.add(s.exerciseId)
  const changes: number[] = []
  for (const id of ids) {
    const a = exerciseRecords(id, recent, loadCtx)
    const b = exerciseRecords(id, before, loadCtx)
    const pickV = (r: typeof a) => (r.best1RM > 0 ? r.best1RM : r.maxHoldSec > 0 ? r.maxHoldSec : r.maxReps)
    const va = pickV(a)
    const vb = pickV(b)
    if (va > 0 && vb > 0) changes.push((va - vb) / vb)
  }
  void exercises
  return changes.length >= 2 ? { change: mean(changes), n: changes.length } : null
}

export function overloadAt(day: DayKey, ctx: OverloadContext): OverloadResult {
  const { byDay } = ctx
  const d7 = lastDays(day, 7)
  const d28 = lastDays(day, 28)
  const comps: OverloadComponent[] = []

  /* 1. Charge d'entraînement : montée récente + manque de repos. */
  const bal = loadBalance(day, ctx.workouts, ctx.checkins, ctx.loadCtx)
  const trained = new Set(ctx.workouts.filter((w) => !w.deleted && !w.backfill && !w.planned && w.day >= d7[0] && w.day <= day).map((w) => w.day))
  const rest = 7 - trained.size
  const loadScore = bal.chronic28 > 0.1 || trained.size > 0
    ? 0.7 * scale(bal.ratio, 0.9, 1.5) + 0.3 * (rest >= 2 ? 0 : rest === 1 ? 50 : 100)
    : null
  comps.push({
    key: 'load', label: 'Charge d’entraînement', score: loadScore, weight: WEIGHTS.load,
    detail: loadScore === null ? 'Pas assez de séances' : `${bal.ratio ? bal.ratio.toFixed(2) : '—'} fois ta charge habituelle, ${rest} jour${rest > 1 ? 's' : ''} de repos sur 7`,
  })

  /* 2. Récupération : plus basse que d'habitude, ou basse en valeur. */
  const r7 = avgOf(d7, byDay, (c) => c.recovery, 3)
  const r28 = avgOf(d28, byDay, (c) => c.recovery, 10)
  let recScore: number | null = null
  if (r7 !== null) {
    const drop = r28 ? scale(((r28 - r7) / r28) * 100, 0, 25) : 0
    const abs = scale(65 - r7, 0, 35)
    recScore = r28 ? 0.5 * drop + 0.5 * abs : abs
  }
  comps.push({
    key: 'recovery', label: 'Récupération WHOOP', score: recScore, weight: WEIGHTS.recovery,
    detail: r7 === null ? 'Pas assez de jours' : `${Math.round(r7)} % cette semaine${r28 ? ` contre ${Math.round(r28)} % ces 4 dernières semaines` : ''}`,
  })

  /* 3. VFC en baisse et FC de repos en hausse. */
  const h7 = avgOf(d7, byDay, (c) => c.hrv, 3)
  const h28 = avgOf(d28, byDay, (c) => c.hrv, 10)
  const f7 = avgOf(d7, byDay, (c) => c.restingHr, 3)
  const f28 = avgOf(d28, byDay, (c) => c.restingHr, 10)
  const hrvDrop = h7 !== null && h28 ? scale(((h28 - h7) / h28) * 100, 0, 18) : null
  const rhrUp = f7 !== null && f28 ? scale(f7 - f28, 0, 6) : null
  const hrvScore = hrvDrop !== null && rhrUp !== null ? 0.6 * hrvDrop + 0.4 * rhrUp : hrvDrop ?? rhrUp
  comps.push({
    key: 'hrv', label: 'VFC et FC de repos', score: hrvScore, weight: WEIGHTS.hrv,
    detail: hrvScore === null ? 'Pas assez de jours' : `VFC ${h7 !== null ? Math.round(h7) : '—'} ms (base ${h28 !== null ? Math.round(h28) : '—'}), FC de repos ${f7 !== null ? Math.round(f7) : '—'} bpm (base ${f28 !== null ? Math.round(f28) : '—'})`,
  })

  /* 4. Dette de sommeil sur 7 jours. */
  const nights = d7.map((d) => sleepHours(byDay.get(d))).filter((h): h is number => h !== null)
  const debt = sleepDebtHours(byDay, day, ctx.sleepGoal, 7)
  const sleepScore = nights.length >= 3 ? scale(debt, 0, 6) : null
  comps.push({
    key: 'sleep', label: 'Sommeil', score: sleepScore, weight: WEIGHTS.sleep,
    detail: sleepScore === null ? 'Pas assez de nuits' : `${nights.length ? (mean(nights)).toFixed(1) : '—'} h en moyenne, ${debt.toFixed(1)} h de dette sur 7 jours`,
  })

  /* 5. Performances en baisse. */
  const perf = performanceChange(day, ctx.workouts, ctx.exercises, ctx.loadCtx)
  const perfScore = perf ? scale(-perf.change * 100, 0, 8) : null
  comps.push({
    key: 'perf', label: 'Performances', score: perfScore, weight: WEIGHTS.perf,
    detail: perf === null ? 'Pas assez de séries comparables' : `${perf.change >= 0 ? '+' : ''}${(perf.change * 100).toFixed(0)} % sur ${perf.n} exercices`,
  })

  const live = comps.filter((c) => c.score !== null)
  const thr = ctx.threshold ?? 80
  if (live.length < 2) return { day, score: null, level: 'ok', components: comps, drivers: [] }
  const wsum = live.reduce((a, c) => a + c.weight, 0)
  const weighted = live.reduce((a, c) => a + (c.score as number) * c.weight, 0) / wsum
  const top2 = [...live].sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 2)
  const score = Math.round(0.55 * weighted + 0.45 * mean(top2.map((c) => c.score as number)))
  const level: OverloadLevel = score >= thr ? 'deload' : score >= thr - 15 ? 'watch' : 'ok'
  const drivers = live.filter((c) => (c.score as number) >= 40).sort((a, b) => (b.score as number) - (a.score as number)).slice(0, 3).map((c) => `${c.label} : ${c.detail}`)
  return { day, score, level, components: comps, drivers }
}

/** Évolution sur `days` jours, un point par jour (pour la courbe). */
export function overloadSeries(today: DayKey, ctx: OverloadContext, days = 28): { day: DayKey; score: number | null }[] {
  return lastDays(today, days).map((d) => ({ day: d, score: overloadAt(d, ctx).score }))
}

/** Le bon moment pour retester un record : frais, peu chargé, récupération haute. */
export function goodTimeForTest(res: OverloadResult, recovery7: number | null): boolean {
  return res.score !== null && res.score < 40 && recovery7 !== null && recovery7 >= 65
}
