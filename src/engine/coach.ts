import type {
  CheckIn,
  DayKey,
  ExerciseDef,
  Injury,
  Joint,
  LoadBalance,
  MuscleZone,
  SetEntry,
} from '../types'
import { addDayKey } from './time'
import { epley1RM } from './strength'

/* ──────────────────────────────────────────────────────────────────────────
   Le « coach » : alerte de charge, semaine légère automatique, charges
   recommandées (1RM) et douleurs. Règles simples, expliquées, sans IA externe.
   Ton calme : on prévient, on ne culpabilise jamais.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Alerte de charge : charge de la semaine ÷ charge habituelle du mois ── */

export interface LoadAlert {
  level: 'low' | 'ok' | 'watch' | 'high'
  title: string
  text: string
}

/** Seuils classiques (ratio aigu / chronique) : au-delà de 1,5 le risque de blessure grimpe. */
export function loadAlert(b: LoadBalance): LoadAlert | null {
  if (b.chronic28 < 0.5) return null
  const pct = Math.round((b.ratio - 1) * 100)
  const gap = `${pct > 0 ? '+' : ''}${pct} % par rapport à ton mois`
  if (b.ratio > 1.5)
    return { level: 'high', title: 'Semaine très chargée', text: `${gap}. Allège les prochains jours : une séance en moins ou 1/3 de séries en moins.` }
  if (b.ratio > 1.3)
    return { level: 'watch', title: 'Semaine chargée', text: `${gap}. À surveiller : garde au moins un vrai jour de récupération.` }
  if (b.ratio < 0.8)
    return { level: 'low', title: 'Semaine plus légère', text: `${gap}. Tu peux remonter doucement si tu te sens bien.` }
  return { level: 'ok', title: 'Charge équilibrée', text: `${gap} : zone idéale pour progresser.` }
}

/* ── Semaine légère automatique ─────────────────────────────────────────── */

export interface LightWeekAdvice {
  active: boolean
  /** Moyenne de récupération des trois derniers jours. */
  avg: number
  days: number
}

/** Récupération sous 50 % trois jours de suite → on propose la version légère. */
export function lightWeekAdvice(checkins: CheckIn[], today: DayKey): LightWeekAdvice {
  const byDay = new Map(checkins.filter((c) => !c.deleted).map((c) => [c.day, c.recovery]))
  const vals: number[] = []
  for (let i = 0; i < 4 && vals.length < 3; i++) {
    const v = byDay.get(addDayKey(today, -i))
    if (typeof v === 'number') vals.push(v)
    else if (i === 0) continue /* le check-in du jour n'est pas encore fait : on ne compte pas ce trou */
    else break
  }
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  return { active: vals.length === 3 && vals.every((v) => v < 50), avg, days: vals.length }
}

/** Version légère : un tiers de séries en moins par exercice, même charge (au moins une série reste). */
export function applyLight(sets: SetEntry[]): SetEntry[] {
  const groups = new Map<string, SetEntry[]>()
  for (const s of sets) groups.set(s.block ?? s.exerciseId, [...(groups.get(s.block ?? s.exerciseId) ?? []), s])
  const drop = new Set<string>()
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const n = Math.min(g.length - 1, Math.round(g.length / 3))
    for (const s of g.slice(g.length - n)) drop.add(s.id)
  }
  return sets.filter((s) => !drop.has(s.id))
}

/* ── Charges recommandées (1RM estimé) ───────────────────────────────── */

const round = (n: number, step = 0.5) => Math.round(n / step) * step

/**
 * Lest conseillé pour `reps` répétitions en gardant `reserve` répétitions en réserve.
 * Pour les mouvements au poids du corps, on retire la part du poids du corps (peut être négatif :
 * élastique d'assistance).
 */
export function recommendedLoadKg(
  ex: Pick<ExerciseDef, 'bodyweightFactor'>,
  oneRM: number,
  reps: number,
  bodyWeightKg: number,
  reserve = 2,
): number | null {
  if (oneRM <= 0 || reps <= 0) return null
  const total = oneRM / (1 + (reps + reserve) / 30)
  return round(total - (ex.bodyweightFactor ?? 0) * bodyWeightKg)
}

/** Meilleur 1RM observé sur des séries réelles récentes (≤ 12 reps : au-delà l'estimation dérive). */
export function observed1RM(
  ex: Pick<ExerciseDef, 'id' | 'kind' | 'bodyweightFactor'>,
  workouts: { sets?: SetEntry[]; deleted?: boolean; planned?: boolean }[],
  bodyWeightKg: number,
): number {
  if (ex.kind === 'static') return 0
  let best = 0
  for (const w of workouts) {
    if (w.deleted || w.planned) continue
    for (const s of w.sets ?? []) {
      if (s.exerciseId !== ex.id || !s.reps || s.reps > 12) continue
      const total = Math.max(1, (ex.bodyweightFactor ?? 0) * bodyWeightKg + (s.loadKg ?? 0))
      best = Math.max(best, epley1RM(total, s.reps))
    }
  }
  return best
}

/* ── Douleurs et blessures ──────────────────────────────────────────── */

/** Muscles qui travaillent autour d'une articulation. */
export const JOINT_ZONES: Record<Joint, MuscleZone[]> = {
  epaules: ['deltoides_ant', 'deltoides_post', 'trapezes', 'pectoraux', 'haut_dos'],
  coudes: ['biceps', 'triceps', 'avantbras'],
  poignets: ['avantbras'],
  genoux: ['quadriceps', 'ischios', 'tibias'],
  chevilles: ['mollets', 'tibias'],
}

const JOINT_SET = new Set<string>(Object.keys(JOINT_ZONES))
export const isJoint = (a: string): a is Joint => JOINT_SET.has(a)

/** Zones concernées par des douleurs en cours, avec la gravité la plus haute (1 → 3). */
export function injuredZones(injuries: Injury[]): Map<MuscleZone, number> {
  const out = new Map<MuscleZone, number>()
  for (const i of injuries) {
    if (i.deleted || !i.active) continue
    const zones = isJoint(i.area) ? JOINT_ZONES[i.area] : [i.area as MuscleZone]
    for (const z of zones) out.set(z, Math.max(out.get(z) ?? 0, i.severity))
  }
  return out
}

export interface ImpactWarning {
  area: string
  severity: number
  exercises: string[]
}

/** Exercices d'une séance qui sollicitent (≥ 40 %) une zone douloureuse. */
export function sessionImpact(
  exercises: Pick<ExerciseDef, 'name' | 'mix'>[],
  injuries: Injury[],
): ImpactWarning[] {
  const live = injuries.filter((i) => !i.deleted && i.active)
  const out: ImpactWarning[] = []
  for (const inj of live) {
    const zones = isJoint(inj.area) ? JOINT_ZONES[inj.area] : [inj.area as MuscleZone]
    const hit = exercises.filter((e) => zones.some((z) => (e.mix[z] ?? 0) >= 0.4)).map((e) => e.name)
    if (hit.length) out.push({ area: inj.area, severity: inj.severity, exercises: [...new Set(hit)] })
  }
  return out.sort((a, b) => b.severity - a.severity)
}

export const SEVERITY_LABEL: Record<number, string> = { 1: 'gêne légère', 2: 'douleur modérée', 3: 'forte douleur' }

export const SEVERITY_ADVICE: Record<number, string> = {
  1: 'Garde la séance, réduis la charge si ça tire.',
  2: 'Évite ou allège les exercices concernés.',
  3: 'Repos de cette zone ; consulte si ça dure.',
}
