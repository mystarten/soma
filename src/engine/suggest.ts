import type {
  BodyFatigue,
  DayKey,
  ExerciseDef,
  MuscleZone,
  Workout,
  WorkoutKind,
  WorkoutTemplate,
  WeekdayPlan,
} from '../types'
import { ZONE_LABEL, ZONE_SHORT } from './fatigueConfig'
import { KIND_FALLBACK_MIX, WORKOUT_KIND_LABEL } from './muscleMap'

import { parseDay } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Suggestions — règles prédéfinies, jamais bloquantes.
   ────────────────────────────────────────────────────────────────────────── */

/** Zones ciblées par un modèle de séance, avec leur poids. */
export function templateZones(
  tpl: WorkoutTemplate,
  exercises: ExerciseDef[],
): Partial<Record<MuscleZone, number>> {
  const out: Partial<Record<MuscleZone, number>> = {}
  for (const item of tpl.items) {
    const ex = exercises.find((e) => e.id === item.exerciseId)
    if (!ex) continue
    for (const [zoneRaw, coef] of Object.entries(ex.mix)) {
      const zone = zoneRaw as MuscleZone
      out[zone] = (out[zone] ?? 0) + (coef ?? 0) * Math.max(1, item.sets)
    }
  }
  if (!tpl.items.length) {
    for (const [zoneRaw, coef] of Object.entries(KIND_FALLBACK_MIX[tpl.kind] ?? {})) {
      out[zoneRaw as MuscleZone] = coef ?? 0
    }
  }
  return out
}

/** Fatigue moyenne pondérée des zones d'un modèle. */
export function templateFatigue(
  tpl: WorkoutTemplate,
  exercises: ExerciseDef[],
  body: BodyFatigue,
): number {
  const zones = templateZones(tpl, exercises)
  let num = 0
  let den = 0
  for (const [zoneRaw, w] of Object.entries(zones)) {
    const zone = zoneRaw as MuscleZone
    num += body[zone].value * (w ?? 0)
    den += w ?? 0
  }
  return den ? num / den : 0
}

export interface SessionSuggestion {
  template?: WorkoutTemplate
  kind: WorkoutKind
  title: string
  sentence: string
  fatigue: number
}

/**
 * Idée de séance du jour : parmi les modèles (et le plan hebdo s'il existe),
 * celui qui sollicite le plus les zones disponibles.
 */
export function suggestSession(
  body: BodyFatigue,
  templates: WorkoutTemplate[],
  exercises: ExerciseDef[],
  today: DayKey,
  plan?: WeekdayPlan,
): SessionSuggestion | null {
  const weekday = parseDay(today).getDay()
  const planned = plan?.find((p) => p.weekday === weekday && p.kind !== 'repos')

  const usable = templates.filter((t) => t.items.length || t.kind === 'course')
  if (!usable.length) {
    if (planned) {
      return {
        kind: planned.kind as WorkoutKind,
        title: planned.label ?? WORKOUT_KIND_LABEL[planned.kind as WorkoutKind],
        sentence: 'C’est ce que ton plan prévoit aujourd’hui.',
        fatigue: 0,
      }
    }
    return null
  }

  const scored = usable
    .map((t) => {
      const f = templateFatigue(t, exercises, body)
      /* Bonus si le modèle correspond au plan du jour. */
      const planBonus = planned && t.kind === planned.kind ? -12 : 0
      return { t, f, score: f + planBonus }
    })
    .sort((a, b) => a.score - b.score)

  const best = scored[0]
  const zones = Object.entries(templateZones(best.t, exercises))
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 2)
    .map(([z]) => ZONE_SHORT[z as MuscleZone])

  let sentence: string
  if (best.f < 25) sentence = `${zones.join(' et ')} sont frais. Bon moment pour pousser.`
  else if (best.f < 50) sentence = `${zones.join(' et ')} sont disponibles, volume normal.`
  else sentence = `Rien n’est totalement frais — vise un volume réduit ou une séance technique.`

  if (planned && best.t.kind === planned.kind) sentence += ' C’est aussi ce que prévoit ton plan.'

  return {
    template: best.t,
    kind: best.t.kind,
    title: best.t.name,
    sentence,
    fatigue: best.f,
  }
}

/**
 * Ligne douce sur le calendrier : une séance prévue touche des zones
 * encore chargées. Pas de blocage, pas de pop-up.
 */
export function plannedConflict(
  planned: Workout,
  body: BodyFatigue,
  exercises: ExerciseDef[],
): string | null {
  const zones: Partial<Record<MuscleZone, number>> = {}
  const add = (mix: Partial<Record<MuscleZone, number>>, w = 1) => {
    for (const [z, c] of Object.entries(mix)) {
      zones[z as MuscleZone] = (zones[z as MuscleZone] ?? 0) + (c ?? 0) * w
    }
  }
  if (planned.sets?.length) {
    for (const s of planned.sets) {
      const ex = exercises.find((e) => e.id === s.exerciseId)
      if (ex) add(ex.mix)
    }
  } else {
    add(planned.fallbackMix ?? KIND_FALLBACK_MIX[planned.kind] ?? {})
  }
  const hot = Object.entries(zones)
    .filter(([z, w]) => (w ?? 0) > 0.4 && body[z as MuscleZone].value >= 55)
    .sort((a, b) => body[b[0] as MuscleZone].value - body[a[0] as MuscleZone].value)
  if (!hot.length) return null
  const [zone] = hot[0]
  const value = Math.round(body[zone as MuscleZone].value)
  const name = ZONE_LABEL[zone as MuscleZone].toLowerCase()
  return `${name} encore à ${value} %, volume réduit conseillé`
}

/** Phrase courte pour le panneau d'une zone. */
export function zoneSentence(zone: MuscleZone, body: BodyFatigue): string {
  const z = body[zone]
  const v = Math.round(z.value)
  const name = ZONE_LABEL[zone]
  if (!z.hasHistory) return `${name} : aucune séance enregistrée récemment.`
  if (v < 15) return `${name} prêt. Tu peux charger.`
  if (v < 35) return `${name} à ${v} %. Quasiment frais, volume normal.`
  if (v < 55) return `${name} à ${v} %. Volume modéré, évite l’échec.`
  if (v < 75) {
    const alt = ALTERNATIVES[zone]
    return `${name} à ${v} %. ${alt}`
  }
  return `${name} à ${v} %. Laisse-lui ${z.readyInHours ? `environ ${z.readyInHours} h` : 'du temps'}.`
}

/** Suggestions d'alternatives quand une zone est chargée. */
const ALTERNATIVES: Record<MuscleZone, string> = {
  dorsaux: 'Vise du poussé ou de la course légère demain.',
  pectoraux: 'Vise du tirage ou des jambes demain.',
  triceps: 'Vise du tirage ou du gainage demain.',
  biceps: 'Vise du poussé ou des jambes demain.',
  deltoides_ant: 'Vise du tirage horizontal ou des jambes.',
  deltoides_post: 'Vise du poussé ou des jambes.',
  trapezes: 'Vise du bas du corps ou du cardio léger.',
  avantbras: 'Évite les suspensions longues, garde le poussé.',
  haut_dos: 'Vise du poussé ou du bas du corps.',
  abdos: 'Garde le gainage court, privilégie le haut du corps.',
  obliques: 'Garde les rotations pour plus tard.',
  lombaires: 'Évite les charnières de hanche, reste sur du haut du corps.',
  fessiers: 'Vise le haut du corps ou du cardio très léger.',
  quadriceps: 'Vise le haut du corps ou de la natation.',
  ischios: 'Évite le fractionné, reste sur du haut du corps.',
  adducteurs: 'Évite les fentes larges, reste sur du haut du corps.',
  mollets: 'Évite la corde à sauter et les côtes, vise du haut du corps.',
  tibias: 'Réduis l’impact : vélo ou natation plutôt que course.',
}

/** Liste lisible de zones. */
export function zoneList(zones: MuscleZone[], max = 5): string {
  const names = zones.slice(0, max).map((z) => ZONE_SHORT[z])
  const rest = zones.length - names.length
  return names.join(', ') + (rest > 0 ? ` +${rest}` : '')
}

