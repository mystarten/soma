import type { CheckIn, DayKey, Workout } from '../types'
import { addDayKey, lastDays } from './time'
import { mean, pearson } from './stats'
import { sleepHours } from './sleep'

/* Analyses croisées WHOOP × séances saisies. Fonctions pures, testables. */

const avg = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? mean(v) : null
}

/** Valeur moyenne sur une fenêtre de jours se terminant à `day` (inclus). */
function windowAvg(byDay: Map<DayKey, CheckIn>, day: DayKey, n: number, pick: (c: CheckIn) => number | null | undefined) {
  return avg(lastDays(day, n).map((d) => { const c = byDay.get(d); return c ? pick(c) : null }))
}

export interface Baseline {
  label: string
  unit: string
  now: number | null
  base: number | null
  /** true si une valeur haute est favorable. */
  higherBetter: boolean
  /** Écart relatif en % entre 7 j et 30 j. */
  deltaPct: number | null
}

/** Forme du moment : 7 derniers jours comparés à la base des 30 jours précédents. */
export function recoveryProfile(byDay: Map<DayKey, CheckIn>, today: DayKey): Baseline[] {
  const defs: { label: string; unit: string; hb: boolean; pick: (c: CheckIn) => number | null | undefined }[] = [
    { label: 'Récupération', unit: '%', hb: true, pick: (c) => c.recovery },
    { label: 'VFC', unit: 'ms', hb: true, pick: (c) => c.hrv },
    { label: 'FC repos', unit: 'bpm', hb: false, pick: (c) => c.restingHr },
    { label: 'Sommeil', unit: 'h', hb: true, pick: (c) => sleepHours(c) },
  ]
  return defs.map((d) => {
    const now = windowAvg(byDay, today, 7, d.pick)
    const base = windowAvg(byDay, today, 30, d.pick)
    return {
      label: d.label,
      unit: d.unit,
      now,
      base,
      higherBetter: d.hb,
      deltaPct: now !== null && base ? ((now - base) / base) * 100 : null,
    }
  })
}

export interface StageShare { deep: number; rem: number; light: number; awake: number; nights: number }

/** Répartition moyenne des phases de sommeil (en % du temps de nuit). */
export function sleepStageShare(byDay: Map<DayKey, CheckIn>, today: DayKey, days = 30): StageShare | null {
  let deep = 0, rem = 0, light = 0, awake = 0, nights = 0
  for (const d of lastDays(today, days)) {
    const s = byDay.get(d)?.sleep
    if (!s || s.deepMin === undefined || s.remMin === undefined || s.lightMin === undefined) continue
    deep += s.deepMin; rem += s.remMin; light += s.lightMin; awake += s.awakeMin ?? 0
    nights++
  }
  const total = deep + rem + light + awake
  if (!nights || !total) return null
  return { deep: (deep / total) * 100, rem: (rem / total) * 100, light: (light / total) * 100, awake: (awake / total) * 100, nights }
}

export interface Bucket { label: string; value: number | null; n: number }

/** Récupération du lendemain selon l'effort du jour (strain WHOOP, sinon rien). */
export function recoveryAfterStrain(byDay: Map<DayKey, CheckIn>, today: DayKey, days = 90): Bucket[] {
  const edges: [string, number, number][] = [['< 8', 0, 8], ['8 – 12', 8, 12], ['12 – 16', 12, 16], ['≥ 16', 16, 99]]
  return edges.map(([label, lo, hi]) => {
    const vals: number[] = []
    for (const d of lastDays(today, days)) {
      const s = byDay.get(d)?.whoopDayStrain
      const next = byDay.get(addDayKey(d, 1))?.recovery
      if (typeof s === 'number' && typeof next === 'number' && s >= lo && s < hi) vals.push(next)
    }
    return { label, value: vals.length ? mean(vals) : null, n: vals.length }
  })
}

/** Récupération moyenne selon les heures de sommeil de la nuit précédente. */
export function recoveryBySleep(byDay: Map<DayKey, CheckIn>, today: DayKey, days = 90): Bucket[] {
  const edges: [string, number, number][] = [['< 6 h', 0, 6], ['6 – 7 h', 6, 7], ['7 – 8 h', 7, 8], ['≥ 8 h', 8, 24]]
  return edges.map(([label, lo, hi]) => {
    const vals: number[] = []
    for (const d of lastDays(today, days)) {
      const c = byDay.get(d)
      const h = sleepHours(c)
      if (h !== null && typeof c?.recovery === 'number' && h >= lo && h < hi) vals.push(c.recovery)
    }
    return { label, value: vals.length ? mean(vals) : null, n: vals.length }
  })
}

/** Jours de la semaine : récupération moyenne (0 = dimanche). */
export function recoveryByWeekday(byDay: Map<DayKey, CheckIn>, today: DayKey, days = 90): (number | null)[] {
  const sums: number[][] = [[], [], [], [], [], [], []]
  for (const d of lastDays(today, days)) {
    const r = byDay.get(d)?.recovery
    if (typeof r === 'number') sums[new Date(`${d}T12:00:00`).getDay()].push(r)
  }
  return sums.map((s) => (s.length ? mean(s) : null))
}

/* ── Effort ────────────────────────────────────────────────────────────── */

export type EffortGroup = 'force' | 'course' | 'cardio' | 'autre'

export function effortGroup(w: Workout): EffortGroup {
  if (w.kind === 'street' || w.kind === 'muscu') return 'force'
  if (w.kind === 'course') return 'course'
  if (w.kind === 'cardio') return 'cardio'
  return 'autre'
}

export interface WeekEffort {
  start: DayKey
  force: number
  course: number
  cardio: number
  autre: number
  sessions: number
  rpe: number | null
}

/** Minutes par type et par semaine (`weeks` dernières semaines, lundi/dimanche selon `weekStart`). */
export function weeklyEffort(workouts: Workout[], today: DayKey, weeks = 8, weekStart: 0 | 1 = 1): WeekEffort[] {
  const dow = new Date(`${today}T12:00:00`).getDay()
  const back = (dow - weekStart + 7) % 7
  const thisStart = addDayKey(today, -back)
  const out: WeekEffort[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDayKey(thisStart, -7 * i)
    const end = addDayKey(start, 6)
    const ws = workouts.filter((w) => !w.backfill && !w.planned && w.day >= start && w.day <= end)
    const row: WeekEffort = { start, force: 0, course: 0, cardio: 0, autre: 0, sessions: ws.length, rpe: avg(ws.map((w) => w.rpe)) }
    for (const w of ws) row[effortGroup(w)] += w.durationMin
    out.push(row)
  }
  return out
}

/** Minutes cumulées par zone de FC (1 → 5) sur la période. */
export function zoneTotals(workouts: Workout[], today: DayKey, days = 28): number[] {
  const from = addDayKey(today, -(days - 1))
  const t = [0, 0, 0, 0, 0]
  for (const w of workouts) {
    if (w.day < from || w.day > today || !w.hrZoneMinutes) continue
    w.hrZoneMinutes.forEach((m, i) => { t[i] += m })
  }
  return t
}

export interface EffortPair { day: DayKey; title: string; rpe: number; strain: number }

/** Ressenti (RPE saisi) mis face à l'effort mesuré par la montre, séance par séance. */
export function perceivedVsMeasured(workouts: Workout[]): EffortPair[] {
  return workouts
    .filter((w) => !w.backfill && typeof w.rpe === 'number' && typeof w.whoopStrain === 'number')
    .map((w) => ({ day: w.day, title: w.title ?? w.kind, rpe: w.rpe as number, strain: w.whoopStrain as number }))
}

/** Écart moyen entre le ressenti (ramené sur 21) et la montre. >0 : tu te sens plus cuit que la montre ne le voit. */
export function perceptionGap(pairs: EffortPair[]): number | null {
  if (pairs.length < 3) return null
  return mean(pairs.map((p) => (p.rpe / 10) * 21 - p.strain))
}

/** Répartition de la charge entre zones faciles (1-2) et dures (4-5) : modèle polarisé. */
export function polarisation(zones: number[]): { easy: number; mid: number; hard: number } | null {
  const total = zones.reduce((a, b) => a + b, 0)
  if (total < 30) return null
  return { easy: ((zones[0] + zones[1]) / total) * 100, mid: (zones[2] / total) * 100, hard: ((zones[3] + zones[4]) / total) * 100 }
}

/* ── Régularité & progression ──────────────────────────────────────────── */

/** Nombre de séances (hors coches de rattrapage) sur chaque semaine, du plus ancien au plus récent. */
export function consistency(workouts: Workout[], today: DayKey, weeks = 12, weekStart: 0 | 1 = 1): { start: DayKey; sessions: number }[] {
  return weeklyEffort(workouts, today, weeks, weekStart).map((w) => ({ start: w.start, sessions: w.sessions }))
}

/** Série de semaines consécutives avec au moins `min` séances (en comptant la semaine en cours seulement si atteinte). */
export function streakWeeks(cons: { sessions: number }[], min = 2): number {
  let s = 0
  for (let i = cons.length - 1; i >= 0; i--) {
    if (cons[i].sessions >= min) s++
    else if (i === cons.length - 1) continue
    else break
  }
  return s
}

export interface Trend { label: string; first: number; last: number; changePct: number }

/** Évolution d'une série (premier tiers → dernier tiers) pour dire si ça monte. */
export function trendOf(label: string, values: (number | null)[]): Trend | null {
  const v = values.filter((x): x is number => typeof x === 'number')
  if (v.length < 6) return null
  const k = Math.max(2, Math.floor(v.length / 3))
  const first = mean(v.slice(0, k))
  const last = mean(v.slice(-k))
  if (!first) return null
  return { label, first, last, changePct: ((last - first) / first) * 100 }
}

/* ── Constats classés ──────────────────────────────────────────────────── */

export interface Insight {
  id: string
  tone: 'good' | 'watch' | 'info'
  title: string
  detail: string
  /** Plus c'est haut, plus c'est important : sert au classement. */
  weight: number
}

export function buildInsights(input: {
  byDay: Map<DayKey, CheckIn>
  workouts: Workout[]
  today: DayKey
  weekStart: 0 | 1
  sleepGoal: number
}): Insight[] {
  const { byDay, workouts, today, weekStart, sleepGoal } = input
  const out: Insight[] = []
  const prof = recoveryProfile(byDay, today)

  const hrv = prof.find((p) => p.label === 'VFC')
  if (hrv?.deltaPct !== null && hrv?.deltaPct !== undefined && Math.abs(hrv.deltaPct) >= 6) {
    const up = hrv.deltaPct > 0
    out.push({
      id: 'hrv', tone: up ? 'good' : 'watch', weight: 80 + Math.min(15, Math.abs(hrv.deltaPct)),
      title: up ? 'VFC en hausse' : 'VFC en baisse',
      detail: `${Math.round(hrv.now!)} ms sur 7 jours contre ${Math.round(hrv.base!)} ms sur 30 jours (${up ? '+' : ''}${hrv.deltaPct.toFixed(0)} %). ${up ? 'Bon signe d’adaptation.' : 'Le corps encaisse moins bien : allège ou dors plus.'}`,
    })
  }
  const rhr = prof.find((p) => p.label === 'FC repos')
  if (rhr?.deltaPct !== null && rhr?.deltaPct !== undefined && rhr.deltaPct >= 4) {
    out.push({ id: 'rhr', tone: 'watch', weight: 70, title: 'FC de repos plus haute', detail: `${Math.round(rhr.now!)} bpm cette semaine (base ${Math.round(rhr.base!)}). Souvent un signe de fatigue ou de début de coup de mou.` })
  }

  // Sommeil
  const hours = lastDays(today, 14).map((d) => sleepHours(byDay.get(d))).filter((h): h is number => h !== null)
  if (hours.length >= 5) {
    const m = mean(hours)
    if (m < sleepGoal - 0.5) out.push({ id: 'sleep', tone: 'watch', weight: 85, title: 'Sommeil sous ton objectif', detail: `${m.toFixed(1)} h en moyenne sur 14 jours pour un objectif de ${sleepGoal} h. C’est le levier le plus simple pour mieux récupérer.` })
    else out.push({ id: 'sleep', tone: 'good', weight: 40, title: 'Sommeil dans l’objectif', detail: `${m.toFixed(1)} h en moyenne sur 14 jours.` })
  }
  const stages = sleepStageShare(byDay, today)
  if (stages && stages.nights >= 5 && stages.deep < 13) {
    out.push({ id: 'deep', tone: 'watch', weight: 55, title: 'Sommeil profond court', detail: `${stages.deep.toFixed(0)} % de ta nuit en profond (repère : 13 – 23 %). Éviter écrans et repas tardifs, coucher régulier.` })
  }

  // Ce qui t'aide vraiment à récupérer
  const bySleep = recoveryBySleep(byDay, today).filter((b) => b.value !== null && b.n >= 3)
  if (bySleep.length >= 2) {
    const best = bySleep.reduce((a, b) => (b.value! > a.value! ? b : a))
    const worst = bySleep.reduce((a, b) => (b.value! < a.value! ? b : a))
    if (best.value! - worst.value! >= 10)
      out.push({ id: 'sleep-rec', tone: 'info', weight: 75, title: `Ton déclic : ${best.label} de sommeil`, detail: `Récupération moyenne de ${Math.round(best.value!)} % après ${best.label}, contre ${Math.round(worst.value!)} % après ${worst.label}.` })
  }
  const afterStrain = recoveryAfterStrain(byDay, today).filter((b) => b.value !== null && b.n >= 3)
  if (afterStrain.length >= 2) {
    const lo = afterStrain[0], hi = afterStrain[afterStrain.length - 1]
    if (lo.value! - hi.value! >= 12)
      out.push({ id: 'strain-rec', tone: 'info', weight: 60, title: 'Effort fort = lendemain plus lent', detail: `Récup moyenne ${Math.round(hi.value!)} % après un effort ${hi.label}, ${Math.round(lo.value!)} % après ${lo.label}. Prévois les séances dures avant une journée tranquille.` })
  }

  // Régularité d'entraînement
  const cons = consistency(workouts, today, 8, weekStart)
  const done = cons.slice(0, -1)
  if (done.length >= 4) {
    const avgS = mean(done.map((c) => c.sessions))
    const streak = streakWeeks(cons, 2)
    if (streak >= 3) out.push({ id: 'streak', tone: 'good', weight: 65, title: `${streak} semaines d’affilée avec 2 séances ou plus`, detail: 'La régularité fait plus que l’intensité : continue comme ça.' })
    else if (avgS < 2) out.push({ id: 'regular', tone: 'watch', weight: 72, title: 'Régularité à reconstruire', detail: `${avgS.toFixed(1)} séance par semaine en moyenne sur les ${done.length} dernières. Vise 3 séances, même courtes.` })
  }

  // Ressenti vs montre
  const gap = perceptionGap(perceivedVsMeasured(workouts))
  if (gap !== null && Math.abs(gap) >= 3)
    out.push({ id: 'perception', tone: 'info', weight: 45, title: gap > 0 ? 'Tu te sens plus cuit que ta montre' : 'Ta montre voit plus dur que toi', detail: gap > 0 ? 'Ton ressenti dépasse l’effort mesuré : la fatigue mentale ou le manque de sommeil pèse peut-être.' : 'Tu encaisses mieux que ton ressenti ne le dit : tu peux sans doute pousser un peu.' })

  // Polarisation
  const pol = polarisation(zoneTotals(workouts, today))
  if (pol && pol.mid > 45)
    out.push({ id: 'zones', tone: 'info', weight: 50, title: 'Beaucoup de temps en zone moyenne', detail: `${pol.mid.toFixed(0)} % de ton temps en zone 3. Alterner vraiment facile et vraiment dur donne de meilleurs gains d’endurance.` })

  return out.sort((a, b) => b.weight - a.weight)
}

export { pearson }
