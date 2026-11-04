import type { Joint, MuscleZone } from '../../types'

/* ──────────────────────────────────────────────────────────────────────────
   Mannequin procédural : aucune ressource externe, aucune licence.
   Repère : sol à y = 0, hanches ≈ 1.05, sommet du crâne ≈ 1.75, face vers +z.
   Chaque zone musculaire est un (ou deux) mesh(s) nommé(s) et cliquable(s).
   Les mêmes données servent à la vue 2D (projection x / y).
   ────────────────────────────────────────────────────────────────────────── */

export type Shape = 'capsule' | 'sphere' | 'box'

export interface Part {
  shape: Shape
  /** Position du centre. */
  p: [number, number, number]
  /** Demi-axes (sphere) ou dimensions (box). Ignoré pour une capsule. */
  s: [number, number, number]
  r?: [number, number, number]
  /** Capsule : rayon et hauteur du segment droit. */
  cap?: [number, number]
  /** Dupliquer symétriquement en −x. */
  mirror?: boolean
}

export interface ZonePart extends Part {
  zone: MuscleZone
  /** Visible de face, de dos, ou des deux. */
  face: 'front' | 'back' | 'both'
}

/** Coque du corps : volumes de base, discrets, non cliquables. */
export const SHELL: Part[] = [
  /* Tête & cou — sommet du crâne 1.76, menton 1.55 */
  { shape: 'sphere', p: [0, 1.655, 0.004], s: [0.092, 0.105, 0.1] },
  { shape: 'capsule', p: [0, 1.5, 0], s: [1, 1, 1], cap: [0.042, 0.05] },
  /* Ceinture scapulaire : relie les deux épaules */
  { shape: 'sphere', p: [0, 1.425, 0], s: [0.168, 0.055, 0.078] },
  /* Torse : empilement resserré pour lire comme un seul volume */
  { shape: 'sphere', p: [0, 1.335, 0], s: [0.145, 0.1, 0.088] },
  { shape: 'sphere', p: [0, 1.215, 0], s: [0.13, 0.095, 0.082] },
  { shape: 'sphere', p: [0, 1.105, 0], s: [0.11, 0.09, 0.074] },
  /* Bassin */
  { shape: 'sphere', p: [0, 0.985, 0], s: [0.132, 0.085, 0.084] },
  /* Épaules */
  { shape: 'sphere', p: [0.162, 1.42, 0], s: [0.056, 0.054, 0.056], mirror: true },
  /* Bras : épaule 1.42 → coude 1.093 → poignet 0.836 */
  { shape: 'capsule', p: [0.194, 1.257, 0], s: [1, 1, 1], cap: [0.039, 0.249], mirror: true },
  { shape: 'capsule', p: [0.206, 0.965, 0], s: [1, 1, 1], cap: [0.033, 0.191], mirror: true },
  { shape: 'sphere', p: [0.21, 0.79, 0], s: [0.03, 0.05, 0.019], mirror: true },
  /* Jambes : hanche 0.93 → genou 0.50 → cheville 0.09 */
  { shape: 'capsule', p: [0.082, 0.715, 0], s: [1, 1, 1], cap: [0.06, 0.31], mirror: true },
  { shape: 'sphere', p: [0.082, 0.505, 0.008], s: [0.05, 0.044, 0.05], mirror: true },
  { shape: 'capsule', p: [0.078, 0.295, 0], s: [1, 1, 1], cap: [0.042, 0.326], mirror: true },
  /* Pieds */
  { shape: 'box', p: [0.078, 0.03, 0.05], s: [0.068, 0.048, 0.16], mirror: true },
]

/** Zones musculaires, collées à la coque. */
export const ZONES: ZonePart[] = [
  /* ── Face ── */
  { zone: 'pectoraux', face: 'front', shape: 'sphere', p: [0.066, 1.345, 0.058], s: [0.072, 0.055, 0.036], mirror: true },
  { zone: 'deltoides_ant', face: 'front', shape: 'sphere', p: [0.157, 1.418, 0.03], s: [0.05, 0.048, 0.038], mirror: true },
  { zone: 'biceps', face: 'front', shape: 'capsule', p: [0.189, 1.272, 0.022], s: [1, 1, 1], cap: [0.027, 0.14], mirror: true },
  { zone: 'abdos', face: 'front', shape: 'sphere', p: [0, 1.15, 0.056], s: [0.06, 0.102, 0.026] },
  { zone: 'obliques', face: 'front', shape: 'sphere', p: [0.085, 1.15, 0.026], s: [0.026, 0.084, 0.038], mirror: true },
  { zone: 'quadriceps', face: 'front', shape: 'capsule', p: [0.085, 0.725, 0.036], s: [1, 1, 1], cap: [0.038, 0.255], mirror: true },
  { zone: 'adducteurs', face: 'front', shape: 'capsule', p: [0.04, 0.72, 0.006], s: [1, 1, 1], cap: [0.022, 0.235], mirror: true },
  { zone: 'tibias', face: 'front', shape: 'capsule', p: [0.074, 0.305, 0.026], s: [1, 1, 1], cap: [0.022, 0.25], mirror: true },

  /* ── Dos ── */
  { zone: 'trapezes', face: 'both', shape: 'sphere', p: [0.06, 1.445, -0.008], s: [0.058, 0.03, 0.05], mirror: true },
  { zone: 'deltoides_post', face: 'back', shape: 'sphere', p: [0.157, 1.418, -0.032], s: [0.05, 0.048, 0.036], mirror: true },
  { zone: 'haut_dos', face: 'back', shape: 'sphere', p: [0.048, 1.358, -0.062], s: [0.054, 0.053, 0.026], mirror: true },
  { zone: 'dorsaux', face: 'back', shape: 'sphere', p: [0.076, 1.245, -0.058], s: [0.064, 0.088, 0.03], mirror: true },
  { zone: 'triceps', face: 'back', shape: 'capsule', p: [0.199, 1.265, -0.024], s: [1, 1, 1], cap: [0.026, 0.15], mirror: true },
  { zone: 'avantbras', face: 'both', shape: 'capsule', p: [0.206, 0.968, 0], s: [1, 1, 1], cap: [0.03, 0.165], mirror: true },
  { zone: 'lombaires', face: 'back', shape: 'sphere', p: [0.038, 1.095, -0.056], s: [0.038, 0.062, 0.024], mirror: true },
  { zone: 'fessiers', face: 'back', shape: 'sphere', p: [0.068, 0.945, -0.046], s: [0.064, 0.058, 0.047], mirror: true },
  { zone: 'ischios', face: 'back', shape: 'capsule', p: [0.085, 0.725, -0.038], s: [1, 1, 1], cap: [0.035, 0.255], mirror: true },
  { zone: 'mollets', face: 'back', shape: 'capsule', p: [0.078, 0.365, -0.026], s: [1, 1, 1], cap: [0.031, 0.17], mirror: true },
]

/** Articulations (couche optionnelle). */
export const JOINT_PARTS: { joint: Joint; p: [number, number, number]; r: number }[] = [
  { joint: 'epaules', p: [0.168, 1.418, 0], r: 0.028 },
  { joint: 'coudes', p: [0.198, 1.093, 0], r: 0.024 },
  { joint: 'poignets', p: [0.208, 0.845, 0], r: 0.02 },
  { joint: 'genoux', p: [0.082, 0.505, 0.012], r: 0.027 },
  { joint: 'chevilles', p: [0.078, 0.09, 0], r: 0.022 },
]

/** Hauteur totale et centre, utilisés pour le cadrage caméra et la vue 2D. */
export const BODY_HEIGHT = 1.76
export const BODY_CENTER_Y = 0.88
export const BODY_HALF_WIDTH = 0.3
