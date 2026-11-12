import type { CheckIn, DayKey, SleepScore } from '../types'
import { clamp, mean, stdev } from './stats'
import { addDayKey, lastDays, toDate } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Score de sommeil (0 → 100) :
     durée vs objectif 40 % · profond + paradoxal 25 % · efficacité 15 %
     régularité des horaires 10 % · dette 7 jours 10 %
   ────────────────────────────────────────────────────────────────────────── */

export const EMPTY_SLEEP_SCORE: SleepScore = {
  score: 0,
  durationPart: 0,
  stagesPart: 0,
  efficiencyPart: 0,
  consistencyPart: 0,
  debtPart: 0,
  debtHours7d: 0,
  hours: null,
}

export function sleepHours(c?: CheckIn): number | null {
  const s = c?.sleep
  if (!s) return null
  if (typeof s.hours === 'number' && s.hours > 0) return s.hours
  const staged = (s.lightMin ?? 0) + (s.deepMin ?? 0) + (s.remMin ?? 0)
  if (staged > 0) return staged / 60
  if (s.bedtime && s.wakeTime) {
    const d = (toDate(s.wakeTime).getTime() - toDate(s.bedtime).getTime()) / 3_600_000
    if (d > 0 && d < 20) return d
  }
  return null
}

/** Minutes depuis minuit, repliées pour que 23 h → −60 (comparaison d'horaires). */
function bedtimeMinutes(isoStr?: string): number | null {
  if (!isoStr) return null
  const d = toDate(isoStr)
  const m = d.getHours() * 60 + d.getMinutes()
  return m > 12 * 60 ? m - 24 * 60 : m
}

/** Régularité des horaires de coucher/lever sur les 7 dernières nuits (0 → 100). */
export function sleepRegularity(byDay: Map<DayKey, CheckIn>, day: DayKey): number | null {
  const beds: number[] = []
  const wakes: number[] = []
  for (const k of lastDays(day, 7)) {
    const c = byDay.get(k)
    const b = bedtimeMinutes(c?.sleep?.bedtime)
    if (b !== null) beds.push(b)
    const w = c?.sleep?.wakeTime ? toDate(c.sleep.wakeTime).getHours() * 60 + toDate(c.sleep.wakeTime).getMinutes() : null
    if (w !== null) wakes.push(w)
  }
  const parts: number[] = []
  if (beds.length >= 3) parts.push(clamp(1 - stdev(beds) / 120, 0, 1) * 100)
  if (wakes.length >= 3) parts.push(clamp(1 - stdev(wakes) / 120, 0, 1) * 100)
  if (!parts.length) return null
  return mean(parts)
}

/** Dette cumulée sur `days` jours : somme des manques par rapport à l'objectif. */
export function sleepDebtHours(
  byDay: Map<DayKey, CheckIn>,
  day: DayKey,
  goalHours: number,
  days = 7,
): number {
  let debt = 0
  for (const k of lastDays(day, days)) {
    const h = sleepHours(byDay.get(k))
    if (h === null) continue
    debt += Math.max(0, goalHours - h)
  }
  return debt
}

export function computeSleepScore(
  byDay: Map<DayKey, CheckIn>,
  day: DayKey,
  goalHours: number,
): SleepScore {
  const c = byDay.get(day)
  const s = c?.sleep
  const hours = sleepHours(c)
  if (!s || hours === null) {
    const debt = sleepDebtHours(byDay, day, goalHours)
    return { ...EMPTY_SLEEP_SCORE, debtHours7d: debt }
  }

  const durationPart = clamp(hours / goalHours, 0, 1) * 40

  const deepRem = (s.deepMin ?? 0) + (s.remMin ?? 0)
  const totalMin = hours * 60
  let stagesPart: number
  if (deepRem > 0 && totalMin > 0) {
    /* Cible : 45 % de sommeil profond + paradoxal. */
    stagesPart = clamp(deepRem / (0.45 * totalMin), 0, 1) * 25
  } else if (typeof s.quality === 'number') {
    stagesPart = clamp(s.quality / 100, 0, 1) * 25
  } else {
    stagesPart = 0.7 * 25
  }

  let efficiencyPart: number
  if (typeof s.efficiency === 'number' && s.efficiency > 0) {
    efficiencyPart = clamp(s.efficiency / 95, 0, 1) * 15
  } else if (typeof s.inBedHours === 'number' && s.inBedHours > 0) {
    efficiencyPart = clamp(hours / s.inBedHours / 0.95, 0, 1) * 15
  } else if (typeof s.awakenings === 'number') {
    efficiencyPart = clamp(1 - s.awakenings / 6, 0, 1) * 15
  } else {
    efficiencyPart = 0.85 * 15
  }

  const reg = typeof s.consistency === 'number' ? s.consistency : sleepRegularity(byDay, day)
  const consistencyPart = reg === null ? 0.7 * 10 : clamp(reg / 100, 0, 1) * 10

  const debtHours7d =
    typeof s.debtMin === 'number' && s.debtMin > 0
      ? s.debtMin / 60
      : sleepDebtHours(byDay, day, goalHours)
  const debtPart = clamp(1 - debtHours7d / 8, 0, 1) * 10

  /* Une nuit venue de WHOOP garde le score de WHOOP (« performance de sommeil ») : c'est le chiffre
     que tu retrouves dans leur application. Les autres nuits utilisent notre calcul. */
  const computed = clamp(durationPart + stagesPart + efficiencyPart + consistencyPart + debtPart, 0, 100)
  const score = c?.source === 'whoop' && typeof s.quality === 'number' && s.quality > 0 ? clamp(s.quality, 0, 100) : computed
  return {
    score,
    durationPart,
    stagesPart,
    efficiencyPart,
    consistencyPart,
    debtPart,
    debtHours7d,
    hours,
  }
}

/** Fenêtre de sommeil réelle ou reconstituée pour la nuit précédant `day`. */
export function sleepWindow(c: CheckIn | undefined, day: DayKey): { start: number; end: number } | null {
  const s = c?.sleep
  const hours = sleepHours(c)
  if (!s && hours === null) return null
  if (s?.bedtime && s?.wakeTime) {
    const start = toDate(s.bedtime).getTime()
    const end = toDate(s.wakeTime).getTime()
    if (end > start && end - start < 20 * 3_600_000) return { start, end }
  }
  if (hours === null) return null
  /* Par défaut : coucher à 23 h la veille, lever après `hours`. */
  const prev = addDayKey(day, -1)
  const [y, m, d] = prev.split('-').map(Number)
  const start = new Date(y, m - 1, d, 23, 0, 0, 0).getTime()
  return { start, end: start + hours * 3_600_000 }
}
