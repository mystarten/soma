import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { BodyFatigue, Joint, MuscleZone } from '../../types'
import {
  BODY_CENTER_Y,
  BODY_HALF_WIDTH,
  BODY_HEIGHT,
  JOINT_PARTS,
  SHELL,
  ZONES,
  type Part,
} from './bodyParts'
import { createJarvisMaterial } from './jarvisMaterial'
import { Skeleton } from './bodySkeleton'
import { HEART_POS, HeartDetail, JointDetail, MuscleDetail, type Lod } from './bodyDetail'
import NeuralLayer, { BRAIN_POS } from '../neural/NeuralLayer'
import type { NeuralGraph, NeuralNode, Vec3 } from '../../engine/neural'
import { fatigueColor } from '../../engine/fatigueConfig'
import { clamp } from '../../engine/stats'

export type BodyLayer = 'muscles' | 'organes' | 'articulations' | 'squelette' | 'tout'

export interface Body3DProps {
  body: BodyFatigue
  layer: BodyLayer
  selected: MuscleZone | 'cerveau' | 'coeur' | Joint | null
  onSelect: (z: MuscleZone | 'cerveau' | 'coeur' | Joint | null) => void
  /** Azimut cible, en radians (0 = face, π = dos). */
  azimuth: number
  sleepScore: number
  cardioScore: number
  restingHr: number | null
  jointLoad: Record<Joint, { ratio: number; color: string }>
  quality: 'high' | 'low'
  compact?: boolean
  /** Écran d'accueil : la molette fait défiler la page, sauf au-dessus de la tête. */
  hero?: boolean
  /** Réseau de neurones logé dans la tête (zoom continu depuis le corps). */
  neural?: {
    graph: NeuralGraph
    positions: Map<string, Vec3>
    hovered: string | null
    setHovered: (id: string | null) => void
    onPick: (n: NeuralNode) => void
    labels: React.RefObject<Map<string, HTMLDivElement>>
    selected?: string | null
    focusSet?: Set<string> | null
    path?: Set<string> | null
    suggested?: { a: string; b: string }[]
    activity?: number
    /** Visite guidée : le réseau tourne seul. */
    tour?: boolean
  }
  /** Ordre de zoom : 1 = au cœur du cerveau, 0 = vue du corps. */
  diveCommand?: { to: number; nonce: number }
  /** Appelé quand on est assez près pour voir les neurones (et inversement). */
  onDeep?: (deep: boolean) => void
  /** Avancement continu de la plongée, pour agrandir la carte en douceur jusqu'au plein écran. */
  onFocus?: (focus: number) => void
  /** Va voir une région du corps de près : point dans le repère du corps, niveau de zoom 0 → 1 (0 = corps entier). */
  regionCommand?: { x: number; y: number; zoom: number; nonce: number }
}

/** État partagé de la plongée vers le cerveau. */
interface DiveState {
  /** Profondeur lissée (0 = corps entier, 1 = au cœur du cerveau). */
  focus: number
  /** Profondeur demandée par la molette, le pincement ou un bouton. */
  target: number
  /** Inclinaison du réseau (glisser vers le haut ou le bas). */
  tilt: number
  headX: number
  headY: number
  headR: number
  /** Zoom sur une région du corps (0 = corps entier, 1 = au plus près), lissé et demandé. */
  bz: number
  bzTarget: number
  /** Point visé, dans le repère du corps. */
  fx: number
  fy: number
  /** Point à viser au prochain tour (position du curseur en coordonnées écran normalisées). */
  pick: { nx: number; ny: number; blend: number } | null
  /** Demi-largeur du corps à l'écran, en pixels. */
  bodyHalfW: number
}

const HEAD_Y = BRAIN_POS[1]
/** Demi-largeur et demi-hauteur du réseau à l'échelle du crâne, pour cadrer la vue finale. */
const DEEP_HALF_W = 0.094
const DEEP_HALF_H = 0.07
/** Au-delà de « dans le crâne », un second palier de zoom va jusqu'au neurone près de soi. */
export const DIVE_MAX = 1.6
const MICRO_MIN = 0.35
/** Distance minimale de la caméra quand on zoome sur le corps. */
const BODY_MIN_DIST = 0.3

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* ── Géométries ───────────────────────────────────────────────────────── */

function useGeometry(part: Part, seg: number) {
  return useMemo(() => {
    if (part.shape === 'capsule') {
      const [r, len] = part.cap ?? [0.04, 0.2]
      return new THREE.CapsuleGeometry(r, len, 4, seg)
    }
    if (part.shape === 'box') return new THREE.BoxGeometry(1, 1, 1, 1, 1, 1)
    return new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)))
  }, [part, seg])
}

function PartMesh({
  part,
  material,
  seg,
  mirrored = false,
  onPick,
  name,
}: {
  part: Part
  material: THREE.Material
  seg: number
  mirrored?: boolean
  onPick?: (e: { stopPropagation: () => void }) => void
  name?: string
}) {
  const geometry = useGeometry(part, seg)
  const sx = mirrored ? -part.p[0] : part.p[0]
  const rot = part.r ?? [0, 0, 0]
  const scale: [number, number, number] =
    part.shape === 'capsule' ? [1, 1, 1] : [part.s[0], part.s[1], part.s[2]]
  return (
    <mesh
      name={name}
      geometry={geometry}
      material={material}
      position={[sx, part.p[1], part.p[2]]}
      rotation={[rot[0], mirrored ? -rot[1] : rot[1], mirrored ? -rot[2] : rot[2]]}
      scale={scale}
      onPointerDown={onPick}
      raycast={onPick ? undefined : () => null}
    />
  )
}

/* ── Zones musculaires ───────────────────────────────────────────────── */

function Muscles({
  body,
  opacity,
  selected,
  onSelect,
  seg,
  clickGuard,
  lod,
}: {
  body: BodyFatigue
  opacity: number
  selected: Body3DProps['selected']
  onSelect: Body3DProps['onSelect']
  seg: number
  clickGuard: () => boolean
  lod: React.RefObject<Lod>
}) {
  const materials = useMemo(() => {
    const m = new Map<MuscleZone, THREE.ShaderMaterial>()
    for (const z of ZONES) {
      if (!m.has(z.zone)) m.set(z.zone, createJarvisMaterial({ opacity, gridScale: 13 }))
    }
    return m
  }, [opacity])

  useEffect(() => () => materials.forEach((mat) => mat.dispose()), [materials])

  const targets = useRef(new Map<MuscleZone, THREE.Color>())

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const [zone, mat] of materials) {
      const z = body[zone]
      const hex = fatigueColor(z.value, z.hasHistory)
      let target = targets.current.get(zone)
      if (!target) {
        target = new THREE.Color(hex)
        targets.current.set(zone, target)
        mat.uniforms.uColor.value.copy(target)
      } else {
        target.set(hex)
        ;(mat.uniforms.uColor.value as THREE.Color).lerp(target, 0.08)
      }
      mat.uniforms.uTime.value = t
      mat.uniforms.uOpacity.value = opacity
      mat.uniforms.uPulse.value = z.value >= 75 && z.hasHistory ? 1 : 0
      mat.uniforms.uSelected.value = selected === zone ? 1 : 0
      mat.uniforms.uGain.value = z.hasHistory ? 1 : 0.6
      /* De près, la forme d'ensemble s'efface pour laisser voir les chefs musculaires ; sur la poitrine, elle laisse voir le cœur. */
      const l = lod.current
      mat.uniforms.uDim.value = Math.min(0.95, l.gate * 0.78 + (zone === 'pectoraux' ? l.heart * 0.95 : 0))
    }
  })

  return (
    <group>
      {ZONES.map((part, i) => {
        const mat = materials.get(part.zone)!
        const pick = (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          if (clickGuard()) onSelect(part.zone)
        }
        return (
          <group key={`${part.zone}-${i}`}>
            <PartMesh part={part} material={mat} seg={seg} onPick={pick} name={part.zone} />
            {part.mirror && (
              <PartMesh part={part} material={mat} seg={seg} mirrored onPick={pick} name={part.zone} />
            )}
          </group>
        )
      })}
    </group>
  )
}

/* ── Coque ────────────────────────────────────────────────────────────── */

function Shell({ seg, opacity, lod }: { seg: number; opacity: number; lod: React.RefObject<Lod> }) {
  const material = useMemo(
    () =>
      createJarvisMaterial({
        color: '#7fd8ff',
        opacity,
        grid: 0.75,
        gridScale: 18,
        rimPower: 2.8,
        gain: 0.55,
      }),
    [opacity],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime
    /* De près, la coque s'efface pour ne pas masquer les muscles et les os. */
    material.uniforms.uGate.value = 1 - lod.current.gate * 0.88
  })
  return (
    <group>
      {SHELL.map((part, i) => (
        <group key={i}>
          <PartMesh part={part} material={material} seg={seg} />
          {part.mirror && <PartMesh part={part} material={material} seg={seg} mirrored />}
        </group>
      ))}
    </group>
  )
}

/* ── Cerveau ──────────────────────────────────────────────────────────── */

function Brain({
  score,
  selected,
  onSelect,
  seg,
  clickGuard,
  dive,
}: {
  score: number
  selected: boolean
  onSelect: () => void
  seg: number
  clickGuard: () => boolean
  dive: React.RefObject<DiveState>
}) {
  const material = useMemo(() => createJarvisMaterial({ opacity: 0.95, grid: 0.3, gridScale: 22, gain: 1.4 }), [])
  const arcMaterial = useMemo(
    () => createJarvisMaterial({ color: '#9b7bff', opacity: 0.9, grid: 0, gain: 1.6 }),
    [],
  )
  useEffect(
    () => () => {
      material.dispose()
      arcMaterial.dispose()
    },
    [material, arcMaterial],
  )
  const group = useRef<THREE.Group>(null)

  useFrame((s) => {
    const color = fatigueColor(100 - clamp(score, 0, 100))
    ;(material.uniforms.uColor.value as THREE.Color).lerp(new THREE.Color(color), 0.06)
    material.uniforms.uTime.value = s.clock.elapsedTime
    material.uniforms.uSelected.value = selected ? 1 : 0
    /* Rythme de pulsation lié au score : plus le sommeil est bon, plus c'est calme. */
    const speed = 1.1 + (1 - clamp(score, 0, 100) / 100) * 2.4
    const f = dive.current?.focus ?? 0
    const k = (1 + Math.sin(s.clock.elapsedTime * (speed + f * 5)) * 0.035) * (1 + f * 0.12)
    if (group.current) group.current.scale.setScalar(k)
    /* Plus on s'approche, plus le cerveau s'allume. */
    material.uniforms.uGain.value = 1.4 + f * 3
    arcMaterial.uniforms.uGain.value = 1.6 + f * 3
    arcMaterial.uniforms.uTime.value = s.clock.elapsedTime
  })

  const hemisphere = useMemo(() => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), [seg])
  const gyrus = useMemo(() => new THREE.TorusGeometry(0.022, 0.007, 5, 9), [])
  const arc = useMemo(() => new THREE.TorusGeometry(0.066, 0.0022, 3, 26, Math.PI * 0.6), [])

  const pick = (e: { stopPropagation: () => void }) => {
    if ((dive.current?.focus ?? 0) > 0.3) return
    e.stopPropagation()
    if (clickGuard()) onSelect()
  }

  return (
    <group position={[0, 1.638, 0.004]}>
      <group ref={group} onPointerDown={pick}>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            geometry={hemisphere}
            material={material}
            position={[s * 0.026, 0, 0]}
            scale={[0.028, 0.036, 0.043]}
          />
        ))}
        {/* Relief léger : quelques circonvolutions */}
        {[
          [0.025, 0.026, 0.008],
          [-0.025, 0.026, 0.008],
          [0.023, -0.008, 0.03],
          [-0.023, -0.008, 0.03],
          [0, 0.032, -0.018],
        ].map((p, i) => (
          <mesh
            key={i}
            geometry={gyrus}
            material={material}
            position={p as [number, number, number]}
            rotation={[Math.PI / 2 + i * 0.4, i * 0.6, 0]}
            scale={0.85}
          />
        ))}
      </group>
      {/* Trois arcs : léger / profond / paradoxal */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          geometry={arc}
          material={arcMaterial}
          rotation={[Math.PI / 2 + i * 0.3, i * 1.15, 0]}
          scale={1 + i * 0.11}
        />
      ))}
    </group>
  )
}

/* ── Cœur & poumons ──────────────────────────────────────────────────── */

function Heart({
  score,
  restingHr,
  selected,
  onSelect,
  seg,
  clickGuard,
  lod,
}: {
  score: number
  restingHr: number | null
  selected: boolean
  onSelect: () => void
  seg: number
  clickGuard: () => boolean
  lod: React.RefObject<Lod>
}) {
  const material = useMemo(
    () => createJarvisMaterial({ opacity: 1, grid: 0.2, gridScale: 16, gain: 1.6 }),
    [],
  )
  const lungMaterial = useMemo(
    () => createJarvisMaterial({ color: '#8fb4ff', opacity: 0.4, grid: 0.6, gridScale: 20, gain: 0.5 }),
    [],
  )
  useEffect(
    () => () => {
      material.dispose()
      lungMaterial.dispose()
    },
    [material, lungMaterial],
  )
  const group = useRef<THREE.Group>(null)
  const sphere = useMemo(() => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), [seg])
  const bpm = restingHr && restingHr > 20 ? restingHr : 60

  useFrame((s) => {
    const color = fatigueColor(100 - clamp(score, 0, 100))
    ;(material.uniforms.uColor.value as THREE.Color).lerp(new THREE.Color(color), 0.06)
    material.uniforms.uTime.value = s.clock.elapsedTime
    material.uniforms.uSelected.value = selected ? 1 : 0
    /* Le cœur détaillé prend le relais quand on s'approche. */
    material.uniforms.uGate.value = 1 - lod.current.heart
    lungMaterial.uniforms.uTime.value = s.clock.elapsedTime
    lungMaterial.uniforms.uGate.value = 1 - lod.current.heart * 0.7
    /* Battement visuel proportionnel à la FC de repos. */
    const phase = (s.clock.elapsedTime * bpm) / 60
    const beat = Math.pow(Math.max(0, Math.sin(phase * Math.PI * 2)), 6)
    if (group.current) group.current.scale.setScalar(1 + beat * 0.14)
  })

  const pick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (clickGuard()) onSelect()
  }

  return (
    <group>
      <group ref={group} position={[0.015, 1.322, 0.01]} onPointerDown={pick}>
        <mesh geometry={sphere} material={material} scale={[0.03, 0.027, 0.025]} />
        <mesh geometry={sphere} material={material} position={[-0.019, 0.012, 0]} scale={[0.021, 0.021, 0.021]} />
        <mesh geometry={sphere} material={material} position={[0.016, 0.014, 0]} scale={[0.019, 0.019, 0.019]} />
        <mesh geometry={sphere} material={material} position={[0.002, -0.028, 0]} scale={[0.014, 0.02, 0.014]} />
      </group>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={sphere}
          material={lungMaterial}
          position={[s * 0.058, 1.338, 0]}
          scale={[0.04, 0.068, 0.044]}
        />
      ))}
    </group>
  )
}

/* ── Articulations ───────────────────────────────────────────────────── */

function Joints({
  jointLoad,
  selected,
  onSelect,
  clickGuard,
  lod,
}: {
  jointLoad: Body3DProps['jointLoad']
  selected: Body3DProps['selected']
  onSelect: Body3DProps['onSelect']
  clickGuard: () => boolean
  lod: React.RefObject<Lod>
}) {
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 10, 8), [])
  const materials = useMemo(() => {
    const m = new Map<Joint, THREE.ShaderMaterial>()
    for (const j of JOINT_PARTS) {
      m.set(j.joint, createJarvisMaterial({ opacity: 0.85, grid: 0, gain: 1.3 }))
    }
    return m
  }, [])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  useFrame((s) => {
    for (const [joint, mat] of materials) {
      const info = jointLoad[joint]
      ;(mat.uniforms.uColor.value as THREE.Color).lerp(new THREE.Color(info.color), 0.08)
      mat.uniforms.uTime.value = s.clock.elapsedTime
      mat.uniforms.uSelected.value = selected === joint ? 1 : 0
      mat.uniforms.uGate.value = 1 - lod.current.gate * 0.85
    }
  })

  return (
    <group>
      {JOINT_PARTS.map((j) =>
        [1, -1].map((side) => (
          <mesh
            key={`${j.joint}${side}`}
            geometry={sphere}
            material={materials.get(j.joint)!}
            position={[j.p[0] * side, j.p[1], j.p[2]]}
            scale={j.r}
            onPointerDown={(e) => {
              e.stopPropagation()
              if (clickGuard()) onSelect(j.joint)
            }}
          />
        )),
      )}
    </group>
  )
}

/* ── Sol technique ───────────────────────────────────────────────────── */

function Platform() {
  const material = useMemo(
    () => createJarvisMaterial({ color: '#35e3ff', opacity: 0.35, grid: 0, gain: 0.7 }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  const ring = useMemo(() => new THREE.TorusGeometry(0.3, 0.0018, 3, 64), [])
  const ring2 = useMemo(() => new THREE.TorusGeometry(0.22, 0.0014, 3, 48), [])
  const spin = useRef<THREE.Group>(null)
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime
    if (spin.current) spin.current.rotation.y = s.clock.elapsedTime * 0.12
  })
  return (
    <group position={[0, 0.008, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={ring} material={material} />
      <group ref={spin}>
        <mesh geometry={ring2} material={material} />
      </group>
    </group>
  )
}

/* ── Rotation & cadrage ──────────────────────────────────────────────── */

function Rig({
  azimuth,
  drag,
  zoom,
  children,
  compact,
  dive,
  bodyRef,
  onDeep,
  onFocus,
  onZoomed,
  lod,
  dprIdle,
  spin,
  tour,
}: {
  azimuth: number
  drag: React.RefObject<number>
  zoom: React.RefObject<number>
  children: React.ReactNode
  compact?: boolean
  dive: React.RefObject<DiveState>
  bodyRef: React.RefObject<THREE.Group | null>
  onDeep?: (deep: boolean) => void
  onFocus?: (focus: number) => void
  onZoomed?: (zoomed: boolean) => void
  lod: React.RefObject<Lod>
  dprIdle: number
  /** Vitesse de rotation résiduelle après un glissement (inertie). */
  spin: React.RefObject<{ v: number; held: boolean }>
  tour: React.RefObject<boolean>
}) {
  const group = useRef<THREE.Group>(null)
  const setDpr = useThree((st) => st.setDpr)
  const lowRes = useRef(false)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const look = useMemo(() => new THREE.Vector3(), [])
  const want = useMemo(() => new THREE.Vector3(), [])
  const probe = useMemo(() => new THREE.Vector3(), [])
  const lastFade = useRef(-1)
  const deepFlag = useRef(false)
  const sentFocus = useRef(-1)
  const zoomedFlag = useRef(false)
  const ray = useMemo(() => new THREE.Raycaster(), [])
  const inv = useMemo(() => new THREE.Matrix4(), [])
  const heartWorld = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    if (!group.current) return
    const d = dive.current
    /* Inertie : le corps continue de tourner après un glissement, en ralentissant. */
    const sp = spin.current
    if (!sp.held && Math.abs(sp.v) > 1e-4) {
      drag.current += sp.v
      sp.v *= 0.93
    }
    /* Visite guidée : le réseau tourne seul et oscille doucement. */
    if (tour.current && d.focus > 0.8) {
      drag.current += 0.0035
      d.tilt += (Math.sin(state.clock.elapsedTime * 0.35) * 0.28 - d.tilt) * 0.02
    }
    const wantRot = azimuth + drag.current
    /* Le réseau dérive lentement quand on est dedans. */
    drag.current += 0.0011 * smoothstep(0.7, 0.95, d.focus)
    group.current.rotation.y += (wantRot - group.current.rotation.y) * 0.12

    /* Cadrage du corps entier. */
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height))
    const bodyH = (BODY_HEIGHT / 2) * (compact ? 1.08 : 1.04)
    const bodyW = BODY_HALF_WIDTH * 1.25
    const base = Math.max(bodyH / tan, bodyW / (tan * aspect)) * zoom.current
    /* Cadrage du réseau, une fois dans le crâne. */
    const deep = Math.max(DEEP_HALF_H / tan, DEEP_HALF_W / (tan * aspect))

    /* Une seule trajectoire continue : la caméra descend vers la tête puis dans le cerveau.
       Interpolation logarithmique : la vitesse de zoom paraît constante du début à la fin. */
    d.focus += (d.target - d.focus) * 0.16
    if (Math.abs(d.target - d.focus) < 0.0004) d.focus = d.target
    const p = Math.min(1, d.focus)
    const e = p * p * (3 - 2 * p)
    let lookY = BODY_CENTER_Y + (HEAD_Y - BODY_CENTER_Y) * Math.min(1, e * 1.5)
    /* Second palier : on s'approche encore, jusqu'à pouvoir examiner un neurone de près. */
    const m = Math.max(0, Math.min(1, (d.focus - 1) / (DIVE_MAX - 1)))
    let dist = base * Math.pow(deep / base, e) * Math.pow(MICRO_MIN, m * m * (3 - 2 * m))
    let lookX = 0

    /* Zoom sur le corps : on vise le point sous le curseur et on s'en approche. Le point
       reste centré même si le corps tourne. Incompatible avec la plongée dans la tête. */
    if (d.focus > 0.001) d.bzTarget = 0
    d.bz += (d.bzTarget - d.bz) * 0.14
    if (Math.abs(d.bzTarget - d.bz) < 0.0004) d.bz = d.bzTarget
    group.current.updateMatrixWorld()
    if (d.pick) {
      /* Rayon de la caméra à travers le curseur, ramené dans le repère du corps. */
      ray.setFromCamera(new THREE.Vector2(d.pick.nx, d.pick.ny), camera)
      inv.copy(group.current.matrixWorld).invert()
      const o = ray.ray.origin.clone().applyMatrix4(inv)
      const dir = ray.ray.direction.clone().transformDirection(inv)
      if (Math.abs(dir.z) > 1e-4) {
        const t = -o.z / dir.z
        const hx = o.x + dir.x * t
        const hy = o.y + dir.y * t
        d.fx += (clamp(hx, -0.34, 0.34) - d.fx) * d.pick.blend
        d.fy += (clamp(hy, 0.04, 1.74) - d.fy) * d.pick.blend
      }
      d.pick = null
    }
    if (d.bz > 0.0005) {
      const zb = d.bz * d.bz * (3 - 2 * d.bz)
      look.set(d.fx, d.fy, 0).applyMatrix4(group.current.matrixWorld)
      lookX = look.x * zb
      lookY = BODY_CENTER_Y + (look.y - BODY_CENTER_Y) * zb
      dist = base * Math.pow(BODY_MIN_DIST / base, zb)
    }
    want.set(lookX, lookY, dist)
    camera.position.lerp(want, 0.3)
    look.set(lookX, lookY, 0)
    camera.lookAt(look)

    /* Niveau de détail : plus la caméra est près, plus on voit de muscles, d'os et d'organes. */
    const gate = smoothstep(1.25, 0.5, dist) * (1 - smoothstep(0.02, 0.2, d.focus))
    heartWorld.set(HEART_POS[0], HEART_POS[1], HEART_POS[2]).applyMatrix4(group.current.matrixWorld)
    const near = Math.hypot(heartWorld.x - lookX, heartWorld.y - lookY)
    const heartGate = smoothstep(0.5, 0.2, dist) * (1 - smoothstep(0.05, 0.13, near)) * (1 - smoothstep(0.02, 0.2, d.focus))
    lod.current.gate = gate
    lod.current.heart = heartGate
    /* Pendant un zoom en mouvement, on affiche en définition réduite : bien plus fluide, net dès l'arrêt. */
    const moving = (Math.abs(d.target - d.focus) > 0.003 && d.focus > 0.02) || Math.abs(d.bzTarget - d.bz) > 0.003
    if (moving !== lowRes.current) {
      lowRes.current = moving
      setDpr(moving ? Math.min(1, dprIdle) : dprIdle)
    }
    const zoomed = zoomedFlag.current ? d.bz > 0.02 : d.bz > 0.05
    if (zoomed !== zoomedFlag.current) {
      zoomedFlag.current = zoomed
      onZoomed?.(zoomed)
    }
    /* Demi-largeur du corps à l'écran : sert à savoir si la molette vise le corps. */
    probe.set(BODY_HALF_WIDTH, BODY_CENTER_Y, 0).project(camera)
    const rx = (probe.x * 0.5 + 0.5) * size.width
    probe.set(-BODY_HALF_WIDTH, BODY_CENTER_Y, 0).project(camera)
    d.bodyHalfW = Math.abs(rx - (probe.x * 0.5 + 0.5) * size.width) / 2

    /* Le corps s'estompe pendant que les neurones apparaissent (voir NeuralLayer). */
    const bodyFade = 1 - smoothstep(0.28, 0.7, d.focus)
    if (bodyRef.current && Math.abs(bodyFade - lastFade.current) > 0.002) {
      lastFade.current = bodyFade
      bodyRef.current.visible = bodyFade > 0.01
      bodyRef.current.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined
        if (m?.uniforms?.uFade) m.uniforms.uFade.value = bodyFade
      })
    }

    /* Où est la tête à l'écran (pour savoir si la molette vise le cerveau). */
    probe.set(0, HEAD_Y, 0).project(camera)
    d.headX = (probe.x * 0.5 + 0.5) * size.width
    d.headY = (-probe.y * 0.5 + 0.5) * size.height
    probe.set(0, HEAD_Y + 0.11, 0).project(camera)
    d.headR = Math.abs((-probe.y * 0.5 + 0.5) * size.height - d.headY)

    if (Math.abs(d.focus - sentFocus.current) > 0.002 || (d.focus === d.target && sentFocus.current !== d.focus)) {
      sentFocus.current = d.focus
      onFocus?.(d.focus)
    }
    const isDeep = deepFlag.current ? d.focus > 0.62 : d.focus > 0.78
    if (isDeep !== deepFlag.current) {
      deepFlag.current = isDeep
      onDeep?.(isDeep)
    }
  })

  return <group ref={group}>{children}</group>
}

function Throttle({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const t = window.setInterval(() => invalidate(), 1000 / fps)
    return () => window.clearInterval(t)
  }, [fps, invalidate])
  return null
}

/* ── Composant principal ─────────────────────────────────────────────── */

export default function Body3D(props: Body3DProps) {
  const { layer, quality, compact } = props
  const seg = quality === 'high' ? 20 : 12
  const drag = useRef(0)
  const zoom = useRef(1)
  const pointer = useRef<{ x: number; y: number; moved: number } | null>(null)
  const spin = useRef({ v: 0, held: false })
  const tourRef = useRef(false)
  tourRef.current = !!props.neural?.tour
  const dive = useRef<DiveState>({
    focus: 0,
    target: 0,
    tilt: 0,
    headX: 0,
    headY: 0,
    headR: 40,
    bz: 0,
    bzTarget: 0,
    fx: 0,
    fy: BODY_CENTER_Y,
    pick: null,
    bodyHalfW: 80,
  })
  const lod = useRef<Lod>({ gate: 0, heart: 0 })
  const [zoomed, setZoomed] = useState(false)
  const bodyRef = useRef<THREE.Group>(null)
  const [deep, setDeep] = useState(false)
  const onDeepProp = useRef(props.onDeep)
  onDeepProp.current = props.onDeep
  const onFocusProp = useRef(props.onFocus)
  onFocusProp.current = props.onFocus
  /* Sans réseau (mini-bonhomme), pas de plongée : la tête serait vide. */
  const canDive = useRef(false)
  canDive.current = !!props.neural
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const heroRef = useRef(props.hero)
  heroRef.current = props.hero

  /* Ordre de zoom venant d'un bouton : même trajectoire continue que la molette. */
  useEffect(() => {
    if (props.diveCommand) {
      dive.current.target = clamp(props.diveCommand.to, 0, DIVE_MAX)
      if (props.diveCommand.to > 0) dive.current.bzTarget = 0
    }
  }, [props.diveCommand])

  /* Raccourci vers une région : on vise le point, puis on s'en approche. */
  useEffect(() => {
    const c = props.regionCommand
    if (!c) return
    const d = dive.current
    d.target = 0
    d.fx = c.x
    d.fy = c.y
    d.bzTarget = clamp(c.zoom, 0, 1)
  }, [props.regionCommand])

  /* Molette : au-dessus de la tête → plongée ; ailleurs → zoom (ou défilement sur l'accueil). */
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheelNative = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect()
      const d = dive.current
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const near = Math.hypot(x - d.headX, y - d.headY) < Math.max(60, d.headR * 2.4)
      const step = Math.max(-0.45, Math.min(0.45, -e.deltaY / 340))
      /* Le curseur est-il sur le corps (colonne centrale) ? */
      const overBody = Math.abs(x - rect.width / 2) < Math.max(40, d.bodyHalfW * 1.15)
      if (step > 0 && canDive.current && d.bzTarget < 0.02 && (near || d.target > 0.02)) {
        e.preventDefault()
        d.target = clamp(d.target + step, 0, DIVE_MAX)
      } else if (step < 0 && d.target > 0.02) {
        e.preventDefault()
        d.target = clamp(d.target + step, 0, DIVE_MAX)
      } else if (step > 0 && overBody && d.target < 0.02) {
        /* Zoom sur la région du corps sous le curseur. */
        e.preventDefault()
        d.pick = { nx: (x / rect.width) * 2 - 1, ny: -((y / rect.height) * 2 - 1), blend: d.bzTarget < 0.03 ? 1 : 0.35 }
        d.bzTarget = clamp(d.bzTarget + step * 0.7, 0, 1)
      } else if (step < 0 && d.bzTarget > 0.02) {
        e.preventDefault()
        d.bzTarget = clamp(d.bzTarget + step * 0.7, 0, 1)
      } else if (!heroRef.current) {
        e.preventDefault()
        zoom.current = clamp(zoom.current + e.deltaY * 0.0012, 0.72, 1.6)
      }
    }
    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', onWheelNative)
  }, [])

  const showMuscles = layer === 'muscles' || layer === 'tout'
  const showOrgans = layer === 'organes' || layer === 'tout'
  const showJoints = layer === 'articulations' || layer === 'tout'
  const showSkeleton = layer === 'squelette' || layer === 'tout'
  const muscleOpacity = layer === 'muscles' ? 0.8 : 0.55

  const clickGuard = () => (pointer.current?.moved ?? 99) < 9

  const onPointerDown = (e: React.PointerEvent) => {
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    spin.current.held = true
    spin.current.v = 0
    pointer.current = { x: e.clientX, y: e.clientY, moved: touches.current.size > 1 ? 99 : 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    /* Pincement à deux doigts : écarter = plonger dans le cerveau. */
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current !== null) {
        const d = dive.current
        const delta = (dist - pinch.current) / 200
        const box = wrap.current?.getBoundingClientRect()
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        const nearHead = !!box && Math.hypot(mx - box.left - d.headX, my - box.top - d.headY) < Math.max(70, d.headR * 2.6)
        if (canDive.current && d.bzTarget < 0.02 && (nearHead || d.target > 0.02)) {
          d.target = clamp(d.target + delta, 0, DIVE_MAX)
        } else if (box && d.target < 0.02) {
          /* Sinon, le pincement zoome sur la région du corps entre les deux doigts. */
          d.pick = {
            nx: ((mx - box.left) / box.width) * 2 - 1,
            ny: -(((my - box.top) / box.height) * 2 - 1),
            blend: d.bzTarget < 0.03 ? 1 : 0.35,
          }
          d.bzTarget = clamp(d.bzTarget + delta * 1.1, 0, 1)
        }
      }
      pinch.current = dist
      if (pointer.current) pointer.current.moved = 99
      return
    }
    const p = pointer.current
    if (!p || e.buttons === 0) return
    const dx = e.clientX - p.x
    p.moved += Math.abs(dx) + Math.abs(e.clientY - p.y)
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    drag.current += dx * 0.011
    spin.current.v = spin.current.v * 0.5 + dx * 0.011 * 0.5
    /* Dans le cerveau, glisser vers le haut ou le bas incline aussi le réseau. */
    if (dive.current.focus > 0.5) dive.current.tilt = clamp(dive.current.tilt + dy * 0.006, -0.9, 0.9)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId)
    spin.current.held = false
    if (touches.current.size < 2) pinch.current = null
    window.setTimeout(() => {
      pointer.current = null
    }, 0)
  }

  return (
    <div ref={wrap} className="h-full w-full">
    <Canvas
      dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
      frameloop="demand"
      camera={{ position: [0, 0.88, 2.4], fov: 32, near: 0.01, far: 20 }}
      gl={{
        antialias: quality === 'high',
        alpha: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      }}
      style={{ touchAction: props.hero && !deep && !zoomed ? 'pan-y' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        scene.background = null
      }}
    >
      <Throttle fps={quality === 'high' ? 60 : 30} />
      <ambientLight intensity={0.5} />
      <Rig
        azimuth={props.azimuth}
        drag={drag}
        zoom={zoom}
        compact={compact}
        dive={dive}
        bodyRef={bodyRef}
        onDeep={(v) => {
          setDeep(v)
          onDeepProp.current?.(v)
        }}
        onFocus={(f) => onFocusProp.current?.(f)}
        onZoomed={setZoomed}
        lod={lod}
        spin={spin}
        tour={tourRef}
        dprIdle={quality === 'high' ? Math.min(2, window.devicePixelRatio || 1) : 1}
      >
        <group ref={bodyRef}>
        <Shell seg={seg} opacity={layer === 'organes' ? 0.22 : 0.3} lod={lod} />
        {showMuscles && (
          <Muscles
            body={props.body}
            opacity={muscleOpacity}
            selected={props.selected}
            onSelect={props.onSelect}
            seg={seg}
            clickGuard={clickGuard}
            lod={lod}
          />
        )}
        {showSkeleton && <Skeleton lod={lod} always={layer === 'squelette'} seg={seg} />}
        {showMuscles && <MuscleDetail body={props.body} lod={lod} seg={Math.max(12, seg)} />}
        {(showJoints || showMuscles) && <JointDetail jointLoad={props.jointLoad} lod={lod} seg={seg} />}
        {showOrgans && (
          <>
            <Brain
              score={props.sleepScore}
              selected={props.selected === 'cerveau'}
              onSelect={() => props.onSelect('cerveau')}
              seg={seg}
              clickGuard={clickGuard}
              dive={dive}
            />
            <Heart
              score={props.cardioScore}
              restingHr={props.restingHr}
              selected={props.selected === 'coeur'}
              onSelect={() => props.onSelect('coeur')}
              seg={seg}
              clickGuard={clickGuard}
              lod={lod}
            />
            <HeartDetail score={props.cardioScore} restingHr={props.restingHr} lod={lod} seg={Math.max(14, seg)} />
          </>
        )}
        {showJoints && (
          <Joints
            jointLoad={props.jointLoad}
            selected={props.selected}
            onSelect={props.onSelect}
            clickGuard={clickGuard}
            lod={lod}
          />
        )}
        <Platform />
        </group>
        {props.neural && (
          <NeuralLayer
            graph={props.neural.graph}
            positions={props.neural.positions}
            quality={quality}
            hovered={props.neural.hovered}
            setHovered={props.neural.setHovered}
            onPick={props.neural.onPick}
            dive={dive}
            labels={props.neural.labels}
            clickGuard={clickGuard}
            selected={props.neural.selected}
            focusSet={props.neural.focusSet}
            path={props.neural.path}
            suggested={props.neural.suggested}
            activity={props.neural.activity}
          />
        )}
      </Rig>
      {quality === 'high' && (
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={0.42} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
    </div>
  )
}
