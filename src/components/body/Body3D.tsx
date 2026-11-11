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
import NeuralLayer, { BRAIN_POS } from '../neural/NeuralLayer'
import type { NeuralGraph, NeuralNode, Vec3 } from '../../engine/neural'
import { fatigueColor } from '../../engine/fatigueConfig'
import { clamp } from '../../engine/stats'

export type BodyLayer = 'muscles' | 'organes' | 'articulations' | 'tout'

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
  }
  /** Ordre de zoom : 1 = au cœur du cerveau, 0 = vue du corps. */
  diveCommand?: { to: number; nonce: number }
  /** Appelé quand on est assez près pour voir les neurones (et inversement). */
  onDeep?: (deep: boolean) => void
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
}

const HEAD_Y = BRAIN_POS[1]
/** Demi-largeur et demi-hauteur du réseau à l'échelle du crâne, pour cadrer la vue finale. */
const DEEP_HALF_W = 0.094
const DEEP_HALF_H = 0.07
/** Au-delà de « dans le crâne », un second palier de zoom va jusqu'au neurone près de soi. */
export const DIVE_MAX = 1.6
const MICRO_MIN = 0.35

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
}: {
  body: BodyFatigue
  opacity: number
  selected: Body3DProps['selected']
  onSelect: Body3DProps['onSelect']
  seg: number
  clickGuard: () => boolean
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

function Shell({ seg, opacity }: { seg: number; opacity: number }) {
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
}: {
  score: number
  restingHr: number | null
  selected: boolean
  onSelect: () => void
  seg: number
  clickGuard: () => boolean
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
    lungMaterial.uniforms.uTime.value = s.clock.elapsedTime
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
}: {
  jointLoad: Body3DProps['jointLoad']
  selected: Body3DProps['selected']
  onSelect: Body3DProps['onSelect']
  clickGuard: () => boolean
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
}: {
  azimuth: number
  drag: React.RefObject<number>
  zoom: React.RefObject<number>
  children: React.ReactNode
  compact?: boolean
  dive: React.RefObject<DiveState>
  bodyRef: React.RefObject<THREE.Group | null>
  onDeep?: (deep: boolean) => void
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const look = useMemo(() => new THREE.Vector3(), [])
  const want = useMemo(() => new THREE.Vector3(), [])
  const probe = useMemo(() => new THREE.Vector3(), [])
  const lastFade = useRef(-1)
  const deepFlag = useRef(false)

  useFrame(() => {
    if (!group.current) return
    const d = dive.current
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
    const lookY = BODY_CENTER_Y + (HEAD_Y - BODY_CENTER_Y) * Math.min(1, e * 1.5)
    /* Second palier : on s'approche encore, jusqu'à pouvoir examiner un neurone de près. */
    const m = Math.max(0, Math.min(1, (d.focus - 1) / (DIVE_MAX - 1)))
    const dist = base * Math.pow(deep / base, e) * Math.pow(MICRO_MIN, m * m * (3 - 2 * m))
    want.set(0, lookY, dist)
    camera.position.lerp(want, 0.3)
    look.set(0, lookY, 0)
    camera.lookAt(look)

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
  const dive = useRef<DiveState>({ focus: 0, target: 0, tilt: 0, headX: 0, headY: 0, headR: 40 })
  const bodyRef = useRef<THREE.Group>(null)
  const [deep, setDeep] = useState(false)
  const onDeepProp = useRef(props.onDeep)
  onDeepProp.current = props.onDeep
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
    if (props.diveCommand) dive.current.target = clamp(props.diveCommand.to, 0, DIVE_MAX)
  }, [props.diveCommand])

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
      if (step > 0 && canDive.current && (near || d.target > 0.02)) {
        e.preventDefault()
        d.target = clamp(d.target + step, 0, DIVE_MAX)
      } else if (step < 0 && d.target > 0.02) {
        e.preventDefault()
        d.target = clamp(d.target + step, 0, DIVE_MAX)
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
  const muscleOpacity = layer === 'muscles' ? 0.8 : 0.55

  const clickGuard = () => (pointer.current?.moved ?? 99) < 9

  const onPointerDown = (e: React.PointerEvent) => {
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    pointer.current = { x: e.clientX, y: e.clientY, moved: touches.current.size > 1 ? 99 : 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    /* Pincement à deux doigts : écarter = plonger dans le cerveau. */
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current !== null && canDive.current) {
        dive.current.target = clamp(dive.current.target + (dist - pinch.current) / 200, 0, DIVE_MAX)
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
    /* Dans le cerveau, glisser vers le haut ou le bas incline aussi le réseau. */
    if (dive.current.focus > 0.5) dive.current.tilt = clamp(dive.current.tilt + dy * 0.006, -0.9, 0.9)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId)
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
      style={{ touchAction: props.hero && !deep ? 'pan-y' : 'none' }}
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
      >
        <group ref={bodyRef}>
        <Shell seg={seg} opacity={layer === 'organes' ? 0.22 : 0.3} />
        {showMuscles && (
          <Muscles
            body={props.body}
            opacity={muscleOpacity}
            selected={props.selected}
            onSelect={props.onSelect}
            seg={seg}
            clickGuard={clickGuard}
          />
        )}
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
            />
          </>
        )}
        {showJoints && (
          <Joints
            jointLoad={props.jointLoad}
            selected={props.selected}
            onSelect={props.onSelect}
            clickGuard={clickGuard}
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
