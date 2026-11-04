import type { BodyFatigue, Joint } from '../types'
import { JOINT_ZONES, NEUTRAL_ZONE_COLOR } from './fatigueConfig'
import { clamp, lerpColor } from './stats'

/* ──────────────────────────────────────────────────────────────────────────
   Articulations : couleur pilotée par le ratio charge 7 j / charge 28 j des
   zones concernées. Neutre jusqu'à un ratio durablement élevé, jamais
   alarmiste (on ne va pas plus loin que l'orange doux).
   ────────────────────────────────────────────────────────────────────────── */

export interface JointInfo {
  ratio: number
  color: string
  label: string
  load7d: number
  base7d: number
}

export const JOINT_NEUTRAL_MAX = 1.15
export const JOINT_HIGH = 1.6

export function jointInfo(body: BodyFatigue, joint: Joint): JointInfo {
  const zones = JOINT_ZONES[joint]
  let load7 = 0
  let base = 0
  for (const z of zones) {
    load7 += body[z].load7d
    base += body[z].load28dAvg7d
  }
  const ratio = base > 0.05 ? load7 / base : 0
  let color = NEUTRAL_ZONE_COLOR
  let label = 'Charge habituelle'
  if (ratio === 0) {
    label = 'Pas de données'
  } else if (ratio <= JOINT_NEUTRAL_MAX) {
    label = 'Charge habituelle'
  } else {
    const t = clamp((ratio - JOINT_NEUTRAL_MAX) / (JOINT_HIGH - JOINT_NEUTRAL_MAX), 0, 1)
    color = lerpColor('#8fa3bd', '#ff8f45', t)
    label = t < 0.5 ? 'Un peu plus que d’habitude' : 'Nettement plus que d’habitude'
  }
  return { ratio, color, label, load7d: load7, base7d: base }
}

export function allJointInfo(body: BodyFatigue): Record<Joint, JointInfo> {
  return {
    epaules: jointInfo(body, 'epaules'),
    coudes: jointInfo(body, 'coudes'),
    poignets: jointInfo(body, 'poignets'),
    genoux: jointInfo(body, 'genoux'),
    chevilles: jointInfo(body, 'chevilles'),
  }
}

/** WebGL disponible ? Testé une seule fois. */
let webglCache: boolean | null = null
export function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    webglCache = !!gl
  } catch {
    webglCache = false
  }
  return webglCache
}

/** Appareil modeste : on réduit polygones, pixel ratio et fréquence. */
export function isLowPower(): boolean {
  if (typeof navigator === 'undefined') return false
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
  const cores = navigator.hardwareConcurrency ?? 4
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrow = window.innerWidth < 820
  return coarse || narrow || cores <= 2 || (typeof mem === 'number' && mem <= 2)
}
