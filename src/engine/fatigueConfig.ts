import type { FatigueConfig, Joint, MuscleZone, ZoneSize } from '../types'
import { clamp, lerpColor } from './stats'

/* ──────────────────────────────────────────────────────────────────────────
   Toutes les constantes du moteur de fatigue vivent ici.
   Réglables dans Réglages → « Moteur de fatigue » (+ retour aux valeurs
   par défaut). Aucune autre partie du code ne doit contenir de nombre magique.
   ────────────────────────────────────────────────────────────────────────── */

export const FATIGUE_CONFIG_VERSION = 2

export const DEFAULT_FATIGUE_CONFIG: FatigueConfig = {
  configVersion: FATIGUE_CONFIG_VERSION,
  /* Repos entre séries : 90 s = neutre. 30 s → effort ×1,15 ; 180 s → ×0,9. */
  restRefSec: 90,
  restSensitivity: 0.0025,
  restFactorMin: 0.9,
  restFactorMax: 1.15,
  /* Saturation du volume. Plus k est grand, plus il faut de volume pour saturer. */
  k: { small: 8.5, medium: 9.5, large: 10.7 },
  /* Poids du pic d'intensité (proximité de l'échec). Calibré pour que :
     – 10 × 18 tractions (≈ 60 % de 31 reps max) → dos ≈ 82
     – 100 pompes d'un coup à l'échec (réf. 100) → pecs ≈ 97, triceps ≈ 83,
       deltoïdes antérieurs ≈ 73 */
  peakWeight: 3.45,
  /* Constantes de temps de récupération, en heures « efficaces ».
     Avec deux bonnes nuits, une grosse séance revient à ~normal après 48 h :
     – 10×18 tractions (dos 82) → ~28 le lendemain, ~6 après 48 h
     – 100 pompes à l'échec → pecs ~97 → ~35 à J+1 → ~12 à J+2 */
  tau: { small: 14, medium: 16, large: 18 },
  effortCap: 1.2,
  failureBonus: 1.25,
  overreachRatio: 1.5,
  overreachBonus: 0.15,
  sleepMultiplier: { min: 1.0, max: 1.6 },
  awakeMultiplier: { min: 0.8, max: 1.2 },
  /* Bornes de la rampe de couleur. */
  colorStops: [0, 15, 35, 55, 75, 100],
  pulseThreshold: 75,
  /* Course : effort = (durée/90 min) × intensité × runLoadPerMin. */
  runLoadPerMin: 2.2,
  cardioLoadPerMin: 1.9,
  downhillBonus: 0.12,
  whoopStrainWeight: 0.35,
  readyThreshold: 20,
}

export const ZONE_SIZE: Record<MuscleZone, ZoneSize> = {
  biceps: 'small',
  avantbras: 'small',
  mollets: 'small',
  abdos: 'small',
  obliques: 'small',
  deltoides_ant: 'medium',
  deltoides_post: 'medium',
  triceps: 'medium',
  trapezes: 'medium',
  tibias: 'medium',
  adducteurs: 'medium',
  haut_dos: 'medium',
  pectoraux: 'large',
  dorsaux: 'large',
  quadriceps: 'large',
  ischios: 'large',
  fessiers: 'large',
  lombaires: 'large',
}

export const ZONE_LABEL: Record<MuscleZone, string> = {
  trapezes: 'Trapèzes',
  deltoides_ant: 'Deltoïdes antérieurs',
  deltoides_post: 'Deltoïdes postérieurs',
  pectoraux: 'Pectoraux',
  biceps: 'Biceps',
  triceps: 'Triceps',
  avantbras: 'Avant-bras',
  haut_dos: 'Haut du dos',
  dorsaux: 'Grands dorsaux',
  abdos: 'Abdominaux',
  obliques: 'Obliques',
  lombaires: 'Lombaires',
  fessiers: 'Fessiers',
  quadriceps: 'Quadriceps',
  ischios: 'Ischio-jambiers',
  adducteurs: 'Adducteurs',
  mollets: 'Mollets',
  tibias: 'Tibias',
}

export const ZONE_SHORT: Record<MuscleZone, string> = {
  trapezes: 'Trapèzes',
  deltoides_ant: 'Delt. ant.',
  deltoides_post: 'Delt. post.',
  pectoraux: 'Pecs',
  biceps: 'Biceps',
  triceps: 'Triceps',
  avantbras: 'Avant-bras',
  haut_dos: 'Haut du dos',
  dorsaux: 'Dorsaux',
  abdos: 'Abdos',
  obliques: 'Obliques',
  lombaires: 'Lombaires',
  fessiers: 'Fessiers',
  quadriceps: 'Quadris',
  ischios: 'Ischios',
  adducteurs: 'Adducteurs',
  mollets: 'Mollets',
  tibias: 'Tibias',
}

/** Zones visibles de face / de dos (une zone peut être sur les deux vues). */
export const FRONT_ZONES: MuscleZone[] = [
  'trapezes',
  'deltoides_ant',
  'pectoraux',
  'biceps',
  'avantbras',
  'abdos',
  'obliques',
  'quadriceps',
  'adducteurs',
  'tibias',
]

export const BACK_ZONES: MuscleZone[] = [
  'trapezes',
  'deltoides_post',
  'haut_dos',
  'dorsaux',
  'triceps',
  'avantbras',
  'lombaires',
  'fessiers',
  'ischios',
  'mollets',
]

export const JOINT_LABEL: Record<Joint, string> = {
  epaules: 'Épaules',
  coudes: 'Coudes',
  poignets: 'Poignets',
  genoux: 'Genoux',
  chevilles: 'Chevilles',
}

/** Zones qui alimentent la charge d'une articulation. */
export const JOINT_ZONES: Record<Joint, MuscleZone[]> = {
  epaules: ['deltoides_ant', 'deltoides_post', 'pectoraux', 'trapezes', 'dorsaux'],
  coudes: ['biceps', 'triceps', 'avantbras'],
  poignets: ['avantbras', 'deltoides_ant'],
  genoux: ['quadriceps', 'ischios', 'mollets'],
  chevilles: ['mollets', 'tibias'],
}

/* ── Rampe de couleur ─────────────────────────────────────────────────── */

const RAMP = [
  { at: 0, color: '#3fe0c8' }, /* vert-cyan doux : prêt */
  { at: 15, color: '#8ee86a' },
  { at: 35, color: '#ffd84d' }, /* jaune clair */
  { at: 55, color: '#ffb02e' }, /* jaune ambre */
  { at: 75, color: '#ff8742' }, /* orange */
  { at: 100, color: '#ff4d4d' }, /* rouge */
]

export const NEUTRAL_ZONE_COLOR = '#5a6c86' /* gris-bleu : aucun historique */

/** Couleur continue d'une fatigue 0 → 100. */
export function fatigueColor(value: number, hasHistory = true): string {
  if (!hasHistory) return NEUTRAL_ZONE_COLOR
  const v = clamp(value, 0, 100)
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i]
    const b = RAMP[i + 1]
    if (v <= b.at) return lerpColor(a.color, b.color, (v - a.at) / (b.at - a.at))
  }
  return RAMP[RAMP.length - 1].color
}

export type FatigueBand = 'pret' | 'frais' | 'moyen' | 'charge' | 'fatigue' | 'inconnu'

export function fatigueBand(value: number, hasHistory = true): FatigueBand {
  if (!hasHistory) return 'inconnu'
  if (value < 15) return 'pret'
  if (value < 35) return 'frais'
  if (value < 55) return 'moyen'
  if (value < 75) return 'charge'
  return 'fatigue'
}

export const BAND_LABEL: Record<FatigueBand, string> = {
  pret: 'Prêt',
  frais: 'Frais',
  moyen: 'Encore un peu chargé',
  charge: 'Chargé',
  fatigue: 'Fatigué',
  inconnu: 'Pas de données',
}
