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
}: {
  score: number
  selected: boolean
  onSelect: () => void
  seg: number
  clickGuard: () => boolean
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
    const k = 1 + Math.sin(s.clock.elapsedTime * speed) * 0.035
    if (group.current) group.current.scale.setScalar(k)
    arcMaterial.uniforms.uTime.value = s.clock.elapsedTime
  })

  const hemisphere = useMemo(() => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)), [seg])
  const gyrus = useMemo(() => new THREE.TorusGeometry(0.022, 0.007, 5, 9), [])
  const arc = useMemo(() => new THREE.TorusGeometry(0.066, 0.0022, 3, 26, Math.PI * 0.6), [])

  const pick = (e: { stopPropagation: () => void }) => {
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
}: {
  azimuth: number
  drag: React.RefObject<number>
  zoom: React.RefObject<number>
  children: React.ReactNode
  compact?: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const target = useMemo(() => new THREE.Vector3(0, BODY_CENTER_Y, 0), [])

  useFrame(() => {
    if (!group.current) return
    const want = azimuth + drag.current
    group.current.rotation.y += (want - group.current.rotation.y) * 0.12

    /* Cadrage automatique : le corps entier tient toujours dans le cadre. */
    const fovRad = (camera.fov * Math.PI) / 180
    const aspect = Math.max(0.2, size.width / Math.max(1, size.height))
    const halfH = (BODY_HEIGHT / 2) * (compact ? 1.08 : 1.04)
    const halfW = BODY_HALF_WIDTH * 1.25
    const distH = halfH / Math.tan(fovRad / 2)
    const distW = halfW / (Math.tan(fovRad / 2) * aspect)
    const dist = Math.max(distH, distW) * zoom.current
    camera.position.lerp(new THREE.Vector3(0, BODY_CENTER_Y, dist), 0.15)
    camera.lookAt(target)
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
  const [, force] = useState(0)

  const showMuscles = layer === 'muscles' || layer === 'tout'
  const showOrgans = layer === 'organes' || layer === 'tout'
  const showJoints = layer === 'articulations' || layer === 'tout'
  const muscleOpacity = layer === 'muscles' ? 0.8 : 0.55

  const clickGuard = () => (pointer.current?.moved ?? 99) < 9

  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, moved: 0 }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current
    if (!p || e.buttons === 0) return
    const dx = e.clientX - p.x
    p.moved += Math.abs(dx) + Math.abs(e.clientY - p.y)
    p.x = e.clientX
    p.y = e.clientY
    drag.current += dx * 0.011
  }
  const onPointerUp = () => {
    window.setTimeout(() => {
      pointer.current = null
    }, 0)
  }
  const onWheel = (e: React.WheelEvent) => {
    zoom.current = clamp(zoom.current + e.deltaY * 0.0012, 0.72, 1.6)
    force((n) => n + 1)
  }

  return (
    <Canvas
      dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
      frameloop="demand"
      camera={{ position: [0, 0.88, 2.4], fov: 32, near: 0.05, far: 20 }}
      gl={{
        antialias: quality === 'high',
        alpha: true,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
      }}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        scene.background = null
      }}
    >
      <Throttle fps={quality === 'high' ? 60 : 30} />
      <ambientLight intensity={0.5} />
      <Rig azimuth={props.azimuth} drag={drag} zoom={zoom} compact={compact}>
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
      </Rig>
      {quality === 'high' && (
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={0.42} luminanceThreshold={0.18} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  )
}
