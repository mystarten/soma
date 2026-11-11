import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BodyFatigue, Joint, MuscleZone } from '../../types'
import type { Part } from './bodyParts'
import { createJarvisMaterial } from './jarvisMaterial'
import { fatigueColor } from '../../engine/fatigueConfig'
import { clamp } from '../../engine/stats'

/* ──────────────────────────────────────────────────────────────────────────
   Détail anatomique : n'apparaît que lorsqu'on zoome de près.
   – chefs musculaires avec fibres (biceps long/court, abdos en 8 blocs, 3 faisceaux
     des ischios, quadriceps à 4 chefs, deltoïde à 3 faisceaux, trapèze en 3 parties…)
   – os et articulations (épaule, coude, poignet, genou, cheville)
   – cœur anatomique (4 cavités, aorte, tronc pulmonaire, veines caves, coronaires)
     et cage thoracique, qui se dévoilent quand on s'approche de la poitrine.
   Tout est procédural, sans ressource externe.
   ────────────────────────────────────────────────────────────────────────── */

/** Niveau de détail courant, calculé par la caméra à chaque image. */
export interface Lod {
  /** 0 = loin, 1 = très près : les chefs musculaires et les os apparaissent. */
  gate: number
  /** 0 → 1 : on regarde le cœur de près. */
  heart: number
}

type DetailPart = Part & { zone: MuscleZone }

const m = (zone: MuscleZone, shape: Part['shape'], p: Part['p'], rest: Partial<Part>): DetailPart => ({
  zone,
  shape,
  p,
  s: [1, 1, 1],
  mirror: true,
  ...rest,
})
const sph = (zone: MuscleZone, p: Part['p'], s: Part['s'], r?: Part['r']) => m(zone, 'sphere', p, { s, r })
/** Un ventre musculaire : fuseau effilé aux deux bouts (une capsule donnerait un tuyau). */
const cap = (zone: MuscleZone, p: Part['p'], c: [number, number], r?: Part['r']) =>
  m(zone, 'sphere', p, { s: [c[0] * 1.05, c[1] / 2 + c[0] * 1.1, c[0] * 0.92], r })

/** Les faisceaux et chefs de chaque muscle (côté droit ; la symétrie est automatique). */
export const MUSCLE_DETAIL: DetailPart[] = [
  /* Pectoraux : trois portions, fibres en éventail vers le bras */
  sph('pectoraux', [0.078, 1.372, 0.056], [0.022, 0.062, 0.024], [0, 0, -1.22]),
  sph('pectoraux', [0.068, 1.335, 0.06], [0.026, 0.068, 0.026], [0, 0, -1.45]),
  sph('pectoraux', [0.06, 1.3, 0.052], [0.02, 0.055, 0.022], [0, 0, -1.7]),
  /* Deltoïde (faisceau latéral ; les faisceaux avant et arrière existent déjà) */
  sph('deltoides_ant', [0.178, 1.415, 0.0], [0.026, 0.052, 0.04]),
  sph('deltoides_post', [0.17, 1.418, -0.03], [0.024, 0.05, 0.026]),
  sph('deltoides_post', [0.15, 1.395, -0.05], [0.02, 0.03, 0.016], [0, 0, -0.6]),
  /* Biceps : chef long, chef court, brachial */
  cap('biceps', [0.187, 1.285, 0.03], [0.016, 0.11]),
  cap('biceps', [0.196, 1.28, 0.018], [0.014, 0.105]),
  cap('biceps', [0.196, 1.2, 0.01], [0.014, 0.07]),
  /* Triceps : trois chefs */
  cap('triceps', [0.195, 1.275, -0.032], [0.017, 0.12]),
  cap('triceps', [0.208, 1.27, -0.022], [0.015, 0.11]),
  cap('triceps', [0.2, 1.215, -0.02], [0.012, 0.07]),
  /* Abdominaux : quatre étages de blocs de chaque côté de la ligne blanche */
  sph('abdos', [0.0275, 1.205, 0.064], [0.024, 0.019, 0.014]),
  sph('abdos', [0.0275, 1.165, 0.066], [0.024, 0.019, 0.014]),
  sph('abdos', [0.0275, 1.125, 0.064], [0.024, 0.019, 0.014]),
  sph('abdos', [0.0275, 1.085, 0.06], [0.022, 0.019, 0.013]),
  /* Obliques et dentelé antérieur */
  sph('obliques', [0.092, 1.2, 0.036], [0.018, 0.04, 0.02], [0, 0, 0.35]),
  sph('obliques', [0.094, 1.15, 0.036], [0.018, 0.04, 0.02], [0, 0, 0.3]),
  sph('obliques', [0.092, 1.1, 0.034], [0.018, 0.04, 0.02], [0, 0, 0.2]),
  sph('obliques', [0.108, 1.285, 0.04], [0.014, 0.012, 0.012]),
  sph('obliques', [0.106, 1.26, 0.042], [0.014, 0.012, 0.012]),
  sph('obliques', [0.102, 1.235, 0.044], [0.014, 0.012, 0.012]),
  sph('obliques', [0.098, 1.21, 0.046], [0.014, 0.012, 0.012]),
  /* Quadriceps : droit fémoral, vaste latéral, vaste médial, et le couturier en diagonale */
  cap('quadriceps', [0.083, 0.735, 0.052], [0.02, 0.22]),
  cap('quadriceps', [0.108, 0.7, 0.034], [0.021, 0.2]),
  cap('quadriceps', [0.064, 0.64, 0.042], [0.02, 0.12]),
  cap('quadriceps', [0.072, 0.76, 0.05], [0.007, 0.2], [0, 0, -0.18]),
  /* Adducteurs */
  cap('adducteurs', [0.034, 0.72, 0.012], [0.012, 0.2]),
  sph('adducteurs', [0.05, 0.93, 0.02], [0.015, 0.02, 0.012]),
  /* Tibias */
  cap('tibias', [0.074, 0.31, 0.03], [0.016, 0.22]),
  cap('tibias', [0.09, 0.31, 0.0], [0.012, 0.2]),
  /* Trapèze : haut, milieu, bas */
  sph('trapezes', [0.045, 1.448, -0.022], [0.022, 0.05, 0.026], [0, 0, -1.2]),
  sph('trapezes', [0.045, 1.385, -0.068], [0.02, 0.062, 0.018], [0, 0, -1.45]),
  sph('trapezes', [0.015, 1.305, -0.07], [0.018, 0.06, 0.016], [0, 0, -0.54]),
  /* Haut du dos : sous-épineux, grand rond, rhomboïdes */
  sph('haut_dos', [0.09, 1.37, -0.066], [0.03, 0.028, 0.014]),
  sph('haut_dos', [0.115, 1.335, -0.06], [0.012, 0.028, 0.014], [0, 0, -0.9]),
  sph('haut_dos', [0.035, 1.36, -0.068], [0.016, 0.04, 0.012]),
  /* Grand dorsal */
  sph('dorsaux', [0.1, 1.285, -0.056], [0.03, 0.06, 0.018], [0, 0, -0.5]),
  sph('dorsaux', [0.07, 1.2, -0.06], [0.04, 0.08, 0.02], [0, 0, -0.2]),
  /* Érecteurs du rachis */
  cap('lombaires', [0.025, 1.14, -0.064], [0.014, 0.14]),
  /* Fessiers : grand et moyen */
  sph('fessiers', [0.07, 0.94, -0.052], [0.058, 0.05, 0.04], [0, 0, -0.5]),
  sph('fessiers', [0.098, 0.99, -0.04], [0.036, 0.03, 0.03]),
  /* Ischio-jambiers : trois faisceaux */
  cap('ischios', [0.1, 0.72, -0.042], [0.019, 0.22]),
  cap('ischios', [0.08, 0.72, -0.045], [0.016, 0.22]),
  cap('ischios', [0.066, 0.7, -0.038], [0.015, 0.2]),
  /* Mollet : jumeaux, soléaire, tendon d'Achille */
  cap('mollets', [0.064, 0.375, -0.03], [0.02, 0.1]),
  cap('mollets', [0.092, 0.375, -0.028], [0.018, 0.09]),
  cap('mollets', [0.078, 0.3, -0.022], [0.016, 0.15]),
  cap('mollets', [0.078, 0.175, -0.02], [0.006, 0.09]),
  /* Cou : sterno-cléido-mastoïdien, élévateur de la scapula */
  sph('trapezes', [0.03, 1.515, 0.03], [0.009, 0.048, 0.009], [0, 0, -0.31]),
  sph('trapezes', [0.04, 1.5, -0.02], [0.01, 0.035, 0.01], [0, 0, -0.3]),
  /* Coiffe des rotateurs : sus-épineux */
  sph('haut_dos', [0.1, 1.41, -0.04], [0.03, 0.014, 0.016], [0, 0, -1.4]),
  /* Hanche : psoas-iliaque, tenseur du fascia lata */
  sph('quadriceps', [0.05, 0.96, 0.03], [0.014, 0.05, 0.016], [0, 0, 0.2]),
  sph('fessiers', [0.115, 0.9, 0.02], [0.014, 0.045, 0.016]),
  /* Jambe : extenseur des orteils ; pied et main */
  cap('tibias', [0.083, 0.3, 0.018], [0.01, 0.18]),
  sph('tibias', [0.078, 0.03, 0.05], [0.025, 0.015, 0.07], [Math.PI / 2, 0, 0]),
  sph('avantbras', [0.208, 0.8, 0.0], [0.014, 0.035, 0.01]),
  /* Avant-bras : fléchisseurs, extenseurs, long supinateur */
  cap('avantbras', [0.205, 0.98, 0.016], [0.016, 0.14]),
  cap('avantbras', [0.208, 0.98, -0.016], [0.015, 0.14]),
  cap('avantbras', [0.215, 1.03, 0.0], [0.011, 0.12]),
]

type BonePart = Part & { joint: Joint }
const b = (joint: Joint, shape: Part['shape'], p: Part['p'], rest: Partial<Part>): BonePart => ({
  joint,
  shape,
  p,
  s: [1, 1, 1],
  mirror: true,
  ...rest,
})

/** Os des articulations : on voit de quoi elles sont faites. */
export const BONE_DETAIL: BonePart[] = [
  /* Épaule : tête de l'humérus, acromion, clavicule, omoplate */
  b('epaules', 'sphere', [0.17, 1.405, 0], { s: [0.024, 0.024, 0.024] }),
  b('epaules', 'sphere', [0.168, 1.446, 0], { s: [0.03, 0.005, 0.016] }),
  b('epaules', 'capsule', [0.095, 1.443, 0.022], { cap: [0.006, 0.15], r: [0, 0, -1.52] }),
  b('epaules', 'sphere', [0.1, 1.34, -0.07], { s: [0.045, 0.07, 0.005] }),
  /* Coude : extrémité de l'humérus, olécrane, tête du radius */
  b('coudes', 'sphere', [0.198, 1.11, 0], { s: [0.02, 0.014, 0.018] }),
  b('coudes', 'sphere', [0.198, 1.085, -0.02], { s: [0.012, 0.014, 0.01] }),
  b('coudes', 'sphere', [0.206, 1.07, 0.01], { s: [0.01, 0.008, 0.01] }),
  /* Poignet : os du carpe */
  b('poignets', 'sphere', [0.2, 0.845, 0.01], { s: [0.009, 0.009, 0.009] }),
  b('poignets', 'sphere', [0.208, 0.845, 0.01], { s: [0.009, 0.009, 0.009] }),
  b('poignets', 'sphere', [0.2, 0.832, -0.004], { s: [0.009, 0.009, 0.009] }),
  b('poignets', 'sphere', [0.208, 0.832, -0.004], { s: [0.009, 0.009, 0.009] }),
  b('poignets', 'sphere', [0.205, 0.866, 0], { s: [0.018, 0.01, 0.012] }),
  /* Genou : condyles, rotule, plateau tibial, tête de la fibula */
  b('genoux', 'sphere', [0.066, 0.515, 0.004], { s: [0.018, 0.022, 0.024] }),
  b('genoux', 'sphere', [0.098, 0.515, 0.004], { s: [0.018, 0.022, 0.024] }),
  b('genoux', 'sphere', [0.082, 0.508, 0.04], { s: [0.014, 0.018, 0.007] }),
  b('genoux', 'sphere', [0.082, 0.482, 0.004], { s: [0.036, 0.008, 0.028] }),
  b('genoux', 'sphere', [0.1, 0.468, -0.006], { s: [0.008, 0.01, 0.008] }),
  /* Cheville : astragale, malléoles, calcanéum */
  b('chevilles', 'sphere', [0.078, 0.085, 0.004], { s: [0.02, 0.014, 0.02] }),
  b('chevilles', 'sphere', [0.058, 0.082, 0.0], { s: [0.008, 0.014, 0.01] }),
  b('chevilles', 'sphere', [0.098, 0.075, -0.002], { s: [0.008, 0.016, 0.01] }),
  b('chevilles', 'sphere', [0.078, 0.045, -0.034], { s: [0.018, 0.022, 0.032] }),
]

function geometryFor(part: Part, seg: number): THREE.BufferGeometry {
  if (part.shape === 'capsule') {
    const [r, len] = part.cap ?? [0.02, 0.1]
    return new THREE.CapsuleGeometry(r, len, 4, seg)
  }
  return new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)))
}

function DetailMesh({
  part,
  material,
  geometry,
  mirrored,
}: {
  part: Part
  material: THREE.Material
  geometry: THREE.BufferGeometry
  mirrored: boolean
}) {
  const rot = part.r ?? [0, 0, 0]
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[mirrored ? -part.p[0] : part.p[0], part.p[1], part.p[2]]}
      rotation={[rot[0], mirrored ? -rot[1] : rot[1], mirrored ? -rot[2] : rot[2]]}
      scale={part.shape === 'capsule' ? 1 : part.s}
      raycast={() => null}
    />
  )
}

/* ── Chefs musculaires ────────────────────────────────────────────────── */

export function MuscleDetail({
  body,
  lod,
  seg,
}: {
  body: BodyFatigue
  lod: React.RefObject<Lod>
  seg: number
}) {
  const group = useRef<THREE.Group>(null)
  const zones = useMemo(() => [...new Set(MUSCLE_DETAIL.map((p) => p.zone))], [])
  const materials = useMemo(() => {
    const out = new Map<MuscleZone, THREE.ShaderMaterial>()
    for (const z of zones) out.set(z, createJarvisMaterial({ opacity: 0.9, grid: 0.08, gain: 1.15, fiber: 1, fiberCount: 20, rimPower: 1.8 }))
    return out
  }, [zones])
  useEffect(() => () => materials.forEach((mat) => mat.dispose()), [materials])
  const geoms = useMemo(() => MUSCLE_DETAIL.map((p) => geometryFor(p, seg)), [seg])
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms])
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame((s) => {
    const l = lod.current
    const g = group.current
    if (!g) return
    g.visible = l.gate > 0.01
    if (!g.visible) return
    for (const [zone, mat] of materials) {
      const z = body[zone]
      tmp.set(fatigueColor(z.value, z.hasHistory))
      ;(mat.uniforms.uColor.value as THREE.Color).lerp(tmp, 0.1)
      mat.uniforms.uTime.value = s.clock.elapsedTime
      /* Quand on regarde le cœur, le muscle qui le recouvre devient transparent. */
      const cover = zone === 'pectoraux' ? 1 - 0.95 * l.heart : 1
      mat.uniforms.uGate.value = l.gate * cover
    }
  })

  return (
    <group ref={group} visible={false}>
      {MUSCLE_DETAIL.map((p, i) => (
        <group key={i}>
          <DetailMesh part={p} material={materials.get(p.zone)!} geometry={geoms[i]} mirrored={false} />
          {p.mirror && <DetailMesh part={p} material={materials.get(p.zone)!} geometry={geoms[i]} mirrored />}
        </group>
      ))}
    </group>
  )
}

/* ── Os et articulations ──────────────────────────────────────────────── */

export function JointDetail({
  jointLoad,
  lod,
  seg,
}: {
  jointLoad: Record<Joint, { ratio: number; color: string }>
  lod: React.RefObject<Lod>
  seg: number
}) {
  const group = useRef<THREE.Group>(null)
  const joints = useMemo(() => [...new Set(BONE_DETAIL.map((p) => p.joint))], [])
  const materials = useMemo(() => {
    const out = new Map<Joint, THREE.ShaderMaterial>()
    for (const j of joints) out.set(j, createJarvisMaterial({ opacity: 0.95, grid: 0.18, gridScale: 28, gain: 1.35, rimPower: 1.6 }))
    return out
  }, [joints])
  useEffect(() => () => materials.forEach((mat) => mat.dispose()), [materials])
  const geoms = useMemo(() => BONE_DETAIL.map((p) => geometryFor(p, Math.max(10, seg))), [seg])
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms])
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame((s) => {
    const l = lod.current
    const g = group.current
    if (!g) return
    g.visible = l.gate > 0.01
    if (!g.visible) return
    for (const [joint, mat] of materials) {
      /* Os : blanc bleuté, teinté par la charge de l'articulation. */
      tmp.set(jointLoad[joint].color).lerp(new THREE.Color('#e8f4ff'), 0.45)
      ;(mat.uniforms.uColor.value as THREE.Color).lerp(tmp, 0.1)
      mat.uniforms.uTime.value = s.clock.elapsedTime
      mat.uniforms.uGate.value = l.gate
    }
  })

  return (
    <group ref={group} visible={false}>
      {BONE_DETAIL.map((p, i) => (
        <group key={i}>
          <DetailMesh part={p} material={materials.get(p.joint)!} geometry={geoms[i]} mirrored={false} />
          {p.mirror && <DetailMesh part={p} material={materials.get(p.joint)!} geometry={geoms[i]} mirrored />}
        </group>
      ))}
    </group>
  )
}

/* ── Cœur anatomique et cage thoracique ───────────────────────────────── */

const HEART_CENTER: [number, number, number] = [0.015, 1.322, 0.01]
export const HEART_POS = HEART_CENTER

const tube = (pts: [number, number, number][], radius: number, seg = 18) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, radius, 8, false)

export function HeartDetail({
  score,
  restingHr,
  lod,
  seg,
}: {
  score: number
  restingHr: number | null
  lod: React.RefObject<Lod>
  seg: number
}) {
  const root = useRef<THREE.Group>(null)
  const ventricles = useRef<THREE.Group>(null)
  const atria = useRef<THREE.Group>(null)
  const muscle = useMemo(() => createJarvisMaterial({ opacity: 1, grid: 0.1, gain: 1.7, fiber: 1, fiberCount: 28, rimPower: 1.5 }), [])
  const artery = useMemo(() => createJarvisMaterial({ color: '#bff3ff', opacity: 0.95, grid: 0, gain: 1.5, rimPower: 1.4 }), [])
  const vein = useMemo(() => createJarvisMaterial({ color: '#9a88ff', opacity: 0.9, grid: 0, gain: 1.3, rimPower: 1.4 }), [])
  const bone = useMemo(() => createJarvisMaterial({ color: '#dff0ff', opacity: 0.8, grid: 0.2, gridScale: 30, gain: 0.95, rimPower: 1.5 }), [])
  useEffect(
    () => () => {
      muscle.dispose()
      artery.dispose()
      vein.dispose()
      bone.dispose()
    },
    [muscle, artery, vein, bone],
  )
  const sphere = useMemo(() => new THREE.SphereGeometry(1, Math.max(14, seg), Math.max(10, Math.round(seg * 0.8))), [seg])
  const tubes = useMemo(
    () => ({
      aorta: tube([[-0.002, 0.018, -0.002], [-0.004, 0.042, -0.004], [0.006, 0.06, -0.008], [0.02, 0.054, -0.012], [0.027, 0.032, -0.016], [0.028, 0.0, -0.018]], 0.0062, 26),
      pulmonary: tube([[-0.004, 0.02, 0.014], [0.0, 0.04, 0.014], [0.002, 0.052, 0.012]], 0.0052, 12),
      pulmL: tube([[0.002, 0.052, 0.012], [0.018, 0.058, 0.008], [0.036, 0.056, 0.0]], 0.0034, 12),
      pulmR: tube([[0.002, 0.052, 0.012], [-0.016, 0.058, 0.008], [-0.038, 0.054, 0.0]], 0.0034, 12),
      vcs: tube([[-0.03, 0.06, 0.0], [-0.028, 0.034, 0.002], [-0.026, 0.012, 0.004]], 0.0048, 12),
      vci: tube([[-0.024, -0.01, 0.0], [-0.027, -0.034, -0.002], [-0.028, -0.06, -0.004]], 0.0052, 12),
      veinsL: tube([[0.03, 0.03, -0.014], [0.02, 0.026, -0.012], [0.014, 0.022, -0.01]], 0.0032, 10),
      veinsR: tube([[-0.038, 0.034, -0.012], [-0.03, 0.026, -0.01], [-0.02, 0.02, -0.006]], 0.0032, 10),
      lad: tube([[0.006, 0.02, 0.02], [0.004, 0.004, 0.026], [0.002, -0.018, 0.026], [0.006, -0.036, 0.016]], 0.0013, 18),
      rca: tube([[-0.006, 0.022, 0.018], [-0.02, 0.01, 0.02], [-0.027, -0.012, 0.016], [-0.02, -0.03, 0.012]], 0.0013, 18),
      lcx: tube([[0.008, 0.02, 0.012], [0.022, 0.012, 0.004], [0.028, -0.004, -0.004]], 0.0012, 12),
    }),
    [],
  )
  useEffect(() => () => Object.values(tubes).forEach((t) => t.dispose()), [tubes])
  const bpm = restingHr && restingHr > 20 ? restingHr : 60

  /* Cage thoracique : côtes en arcs fins (du sternum vers la colonne), sternum, colonne. */
  const ribGeoms = useMemo(() => {
    const out: THREE.BufferGeometry[] = []
    for (let i = 0; i < 10; i++) {
      const y0 = 1.395 - i * 0.021
      const sx = 0.1 + Math.sin((i / 9) * Math.PI * 0.8 + 0.2) * 0.04
      const sz = 0.066 + i * 0.001
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 16; k++) {
        const phi = 0.12 + (k / 16) * 2.6
        /* La côte descend en avançant vers le sternum. */
        pts.push(new THREE.Vector3(sx * Math.sin(phi), y0 - 0.026 * (1 - k / 16), sz * Math.cos(phi) - 0.004))
      }
      out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.0032, 6, false))
    }
    return out
  }, [])
  const vert = useMemo(() => Array.from({ length: 14 }, (_, i) => 1.42 - i * 0.026), [])
  useEffect(() => () => ribGeoms.forEach((g) => g.dispose()), [ribGeoms])

  useFrame((s) => {
    const l = lod.current
    const g = root.current
    if (!g) return
    g.visible = l.heart > 0.01
    if (!g.visible) return
    const gate = l.heart
    const tmp = new THREE.Color(fatigueColor(100 - clamp(score, 0, 100)))
    ;(muscle.uniforms.uColor.value as THREE.Color).lerp(tmp, 0.08)
    for (const mat of [muscle, artery, vein, bone]) {
      mat.uniforms.uTime.value = s.clock.elapsedTime
      mat.uniforms.uGate.value = gate
    }
    /* Systole : les ventricules se contractent, les oreillettes se remplissent. */
    const phase = (s.clock.elapsedTime * bpm) / 60
    const f = phase - Math.floor(phase)
    const sys = f < 0.35 ? Math.sin((f / 0.35) * Math.PI) : 0
    const dia = f >= 0.3 && f < 0.7 ? Math.sin(((f - 0.3) / 0.4) * Math.PI) : 0
    ventricles.current?.scale.setScalar(1 - sys * 0.09)
    atria.current?.scale.setScalar(1 + sys * 0.05 - dia * 0.03)
  })

  return (
    <group ref={root} visible={false}>
      {/* Cage thoracique */}
      <group>
        {ribGeoms.map((g, i) => (
          <group key={i}>
            <mesh geometry={g} material={bone} raycast={() => null} />
            <mesh geometry={g} material={bone} scale={[-1, 1, 1]} raycast={() => null} />
          </group>
        ))}
        <mesh geometry={sphere} material={bone} position={[0, 1.33, 0.072]} scale={[0.012, 0.062, 0.006]} raycast={() => null} />
        {vert.map((y, i) => (
          <mesh key={i} geometry={sphere} material={bone} position={[0, y, -0.048]} scale={[0.012, 0.009, 0.011]} raycast={() => null} />
        ))}
      </group>

      {/* Cœur */}
      <group position={HEART_CENTER} rotation={[0, 0, -0.35]}>
        <group ref={ventricles}>
          <mesh geometry={sphere} material={muscle} position={[0.012, -0.006, 0.004]} scale={[0.022, 0.034, 0.02]} rotation={[0, 0, 0.3]} raycast={() => null} />
          <mesh geometry={sphere} material={muscle} position={[-0.012, -0.006, 0.014]} scale={[0.02, 0.029, 0.016]} rotation={[0, 0, 0.1]} raycast={() => null} />
        </group>
        <group ref={atria}>
          <mesh geometry={sphere} material={muscle} position={[0.016, 0.026, -0.012]} scale={[0.016, 0.012, 0.012]} raycast={() => null} />
          <mesh geometry={sphere} material={muscle} position={[-0.024, 0.014, 0.004]} scale={[0.014, 0.02, 0.014]} raycast={() => null} />
        </group>
        <mesh geometry={tubes.aorta} material={artery} raycast={() => null} />
        <mesh geometry={tubes.pulmonary} material={artery} raycast={() => null} />
        <mesh geometry={tubes.pulmL} material={artery} raycast={() => null} />
        <mesh geometry={tubes.pulmR} material={artery} raycast={() => null} />
        <mesh geometry={tubes.vcs} material={vein} raycast={() => null} />
        <mesh geometry={tubes.vci} material={vein} raycast={() => null} />
        <mesh geometry={tubes.veinsL} material={vein} raycast={() => null} />
        <mesh geometry={tubes.veinsR} material={vein} raycast={() => null} />
        <mesh geometry={tubes.lad} material={artery} raycast={() => null} />
        <mesh geometry={tubes.rca} material={artery} raycast={() => null} />
        <mesh geometry={tubes.lcx} material={artery} raycast={() => null} />
      </group>
    </group>
  )
}
