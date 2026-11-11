import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createJarvisMaterial } from './jarvisMaterial'
import type { Lod } from './bodyDetail'

/* ──────────────────────────────────────────────────────────────────────────
   Squelette, moelle épinière et nerfs : de la tête aux pieds, côté droit défini
   puis symétrisé. Rendu schématique (hologramme), construit à la main, sans modèle externe.
   Les nerfs sont dorés : le rouge reste réservé à la fatigue musculaire.
   ────────────────────────────────────────────────────────────────────────── */

type V3 = [number, number, number]

interface Bone {
  /** Centre. */
  p: V3
  /** Demi-axes de l'ellipsoïde. */
  s: V3
  r?: V3
  mirror?: boolean
}

/** Un os long entre deux points (dans le plan x-y, profondeur z fixe). */
const longBone = (a: V3, b: V3, radius: number, mirror = true): Bone => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  return {
    p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    s: [radius, len / 2 + radius * 0.6, radius],
    r: [0, 0, Math.atan2(-dx, dy)],
    mirror,
  }
}
const blob = (p: V3, s: V3, r?: V3, mirror = true): Bone => ({ p, s, r, mirror })

function buildBones(): Bone[] {
  const out: Bone[] = []
  /* Crâne et mâchoire */
  out.push(blob([0, 1.668, 0.004], [0.082, 0.09, 0.094], undefined, false))
  out.push(blob([0, 1.6, 0.034], [0.05, 0.022, 0.042], undefined, false))
  out.push(blob([0, 1.628, 0.07], [0.034, 0.02, 0.022], undefined, false))
  /* Colonne : 7 cervicales, 12 thoraciques, 5 lombaires, sacrum, coccyx */
  for (let i = 0; i < 7; i++) out.push(blob([0, 1.572 - i * 0.02, -0.01 - i * 0.002], [0.014, 0.009, 0.013], undefined, false))
  for (let i = 0; i < 12; i++) {
    const t = i / 11
    out.push(blob([0, 1.43 - i * 0.0215, -0.03 - Math.sin(t * Math.PI) * 0.022], [0.015 + t * 0.003, 0.0095, 0.014], undefined, false))
  }
  for (let i = 0; i < 5; i++) out.push(blob([0, 1.14 - i * 0.024, -0.05 + i * 0.004], [0.021, 0.0115, 0.017], undefined, false))
  out.push(blob([0, 0.975, -0.052], [0.036, 0.042, 0.014], [0.25, 0, 0], false))
  out.push(blob([0, 0.925, -0.044], [0.009, 0.016, 0.008], undefined, false))
  /* Sternum : manubrium, corps, appendice xiphoïde */
  out.push(blob([0, 1.385, 0.068], [0.022, 0.016, 0.007], undefined, false))
  out.push(blob([0, 1.31, 0.074], [0.014, 0.058, 0.006], undefined, false))
  out.push(blob([0, 1.24, 0.07], [0.006, 0.014, 0.004], undefined, false))
  /* Épaule : clavicule, omoplate, tête de l'humérus */
  out.push(longBone([0.02, 1.44, 0.03], [0.165, 1.447, 0.0], 0.006))
  out.push(blob([0.1, 1.34, -0.07], [0.045, 0.07, 0.005], [0, 0, -0.15]))
  out.push(blob([0.17, 1.405, 0], [0.024, 0.024, 0.024]))
  /* Bras : humérus, cubitus et radius */
  out.push(longBone([0.172, 1.4, 0], [0.198, 1.115, 0], 0.011))
  out.push(longBone([0.2, 1.085, 0.008], [0.208, 0.855, 0.008], 0.007))
  out.push(longBone([0.196, 1.085, -0.008], [0.202, 0.855, -0.008], 0.007))
  /* Main : carpe, métacarpiens, doigts à trois phalanges */
  out.push(blob([0.205, 0.84, 0], [0.018, 0.01, 0.01]))
  for (let f = 0; f < 5; f++) {
    const x0 = 0.194 + f * 0.0085
    const len = [0.06, 0.07, 0.074, 0.068, 0.056][f]
    let y = 0.83
    for (let k = 0; k < 3; k++) {
      const seg = len * [0.4, 0.32, 0.28][k]
      out.push(longBone([x0 + f * 0.0008, y, 0.002], [x0 + f * 0.0016, y - seg, 0.002], 0.0038))
      y -= seg
    }
  }
  /* Bassin */
  out.push(blob([0.088, 0.998, -0.012], [0.046, 0.054, 0.02], [0, 0.45, 0.1]))
  out.push(blob([0.062, 0.93, 0.002], [0.02, 0.026, 0.014]))
  out.push(blob([0.012, 0.912, 0.042], [0.016, 0.01, 0.01]))
  /* Jambe : fémur, rotule, tibia, péroné */
  out.push(blob([0.07, 0.93, 0], [0.022, 0.022, 0.022]))
  out.push(longBone([0.078, 0.925, 0.002], [0.082, 0.52, 0.002], 0.015))
  out.push(blob([0.1, 0.915, 0.002], [0.012, 0.018, 0.014]))
  out.push(longBone([0.082, 0.478, 0.004], [0.078, 0.095, 0.004], 0.0125))
  out.push(longBone([0.1, 0.468, -0.008], [0.098, 0.078, -0.008], 0.0075))
  /* Pied : tarse, métatarsiens, orteils */
  out.push(blob([0.078, 0.045, -0.012], [0.026, 0.024, 0.05]))
  for (let t = 0; t < 5; t++) {
    const x = 0.062 + t * 0.0115
    out.push(longBone([x, 0.024, 0.04], [x + (t - 2) * 0.002, 0.014, 0.135], 0.0045))
  }
  return out
}

/** Côtes : douze paires, arcs fins du dos vers le sternum. */
function buildRibs(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (let i = 0; i < 12; i++) {
    const y0 = 1.405 - i * 0.0215
    const sx = 0.085 + Math.sin(((i + 0.6) / 12) * Math.PI) * 0.055
    const sz = 0.062 + i * 0.0006
    const pts: THREE.Vector3[] = []
    const reach = i < 7 ? 2.65 : i < 10 ? 2.2 : 1.6
    for (let k = 0; k <= 16; k++) {
      const phi = 0.15 + (k / 16) * reach
      pts.push(new THREE.Vector3(sx * Math.sin(phi), y0 - 0.026 * (1 - k / 16), sz * Math.cos(phi) - 0.016))
    }
    out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0028, 5, false))
  }
  return out
}

const tube = (pts: V3[], radius: number, seg = 24) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, radius, 6, false)

/** Moelle épinière, cauda equina et nerfs principaux (côté droit ; les nerfs pairs sont symétrisés). */
function buildNerves(): { central: THREE.BufferGeometry[]; paired: THREE.BufferGeometry[] } {
  const central: THREE.BufferGeometry[] = [
    /* Tronc cérébral et moelle épinière */
    tube([[0, 1.64, 0], [0, 1.6, -0.012], [0, 1.52, -0.016], [0, 1.43, -0.045], [0, 1.3, -0.056], [0, 1.18, -0.056], [0, 1.14, -0.05]], 0.0058, 40),
  ]
  /* Cauda equina : des filets qui descendent vers le sacrum */
  for (let i = -3; i <= 3; i++) {
    central.push(tube([[0, 1.14, -0.05], [i * 0.004, 1.08, -0.052], [i * 0.006, 1.02, -0.054], [i * 0.007, 0.97, -0.056]], 0.0012, 14))
  }
  const paired: THREE.BufferGeometry[] = [
    /* Nerf vague : de la base du crâne jusqu'au cœur et à l'abdomen */
    tube([[0.022, 1.6, -0.008], [0.026, 1.52, 0.012], [0.022, 1.42, 0.03], [0.02, 1.33, 0.03], [0.018, 1.2, 0.028], [0.016, 1.1, 0.026]], 0.0016, 30),
    /* Chaîne sympathique le long de la colonne */
    tube([[0.02, 1.54, -0.02], [0.02, 1.4, -0.045], [0.02, 1.25, -0.052], [0.02, 1.1, -0.046], [0.02, 0.98, -0.05]], 0.0012, 30),
    /* Plexus brachial puis nerfs médian, ulnaire et radial */
    tube([[0.004, 1.5, -0.018], [0.07, 1.44, -0.012], [0.15, 1.405, -0.004]], 0.0022, 16),
    tube([[0.15, 1.405, -0.004], [0.186, 1.27, 0.014], [0.2, 1.1, 0.012], [0.206, 0.92, 0.01], [0.208, 0.8, 0.008]], 0.0019, 28),
    tube([[0.15, 1.405, -0.004], [0.2, 1.28, -0.006], [0.19, 1.12, -0.016], [0.2, 0.92, -0.01], [0.213, 0.8, -0.004]], 0.0017, 28),
    tube([[0.15, 1.405, -0.01], [0.206, 1.26, -0.026], [0.214, 1.12, -0.004], [0.212, 0.92, 0.004], [0.22, 0.78, 0.004]], 0.0017, 28),
    /* Plexus lombo-sacré : nerf fémoral devant, sciatique derrière, qui se divise au genou */
    tube([[0.016, 1.04, -0.05], [0.04, 0.97, 0.004], [0.066, 0.8, 0.034], [0.074, 0.56, 0.036]], 0.0021, 28),
    tube([[0.016, 0.98, -0.056], [0.06, 0.945, -0.04], [0.08, 0.76, -0.04], [0.082, 0.54, -0.032]], 0.0026, 30),
    tube([[0.082, 0.54, -0.032], [0.078, 0.34, -0.02], [0.074, 0.12, -0.008], [0.074, 0.04, 0.03], [0.076, 0.02, 0.09]], 0.0018, 30),
    tube([[0.082, 0.54, -0.032], [0.098, 0.48, -0.02], [0.092, 0.3, 0.012], [0.088, 0.1, 0.03], [0.09, 0.04, 0.08]], 0.0016, 30),
  ]
  return { central, paired }
}

export function Skeleton({
  lod,
  always,
  seg,
}: {
  lod: React.RefObject<Lod>
  /** Vrai en vue « Os & nerfs » : visible à toute distance. */
  always: boolean
  seg: number
}) {
  const root = useRef<THREE.Group>(null)
  const bones = useMemo(buildBones, [])
  const ribs = useMemo(buildRibs, [])
  const nerves = useMemo(buildNerves, [])
  const boneGeo = useMemo(() => new THREE.SphereGeometry(1, Math.max(8, seg), Math.max(6, Math.round(seg * 0.7))), [seg])
  const boneMat = useMemo(() => createJarvisMaterial({ color: '#dff0ff', opacity: 0.9, grid: 0.12, gridScale: 26, gain: 1.35, rimPower: 1.5 }), [])
  const nerveMat = useMemo(() => createJarvisMaterial({ color: '#ffd66b', opacity: 1, grid: 0, gain: 1.7, rimPower: 1.2 }), [])
  const cordMat = useMemo(() => createJarvisMaterial({ color: '#fff0b0', opacity: 1, grid: 0, gain: 1.5, rimPower: 1.2 }), [])
  useEffect(
    () => () => {
      boneGeo.dispose()
      boneMat.dispose()
      nerveMat.dispose()
      cordMat.dispose()
      ribs.forEach((g) => g.dispose())
      nerves.central.forEach((g) => g.dispose())
      nerves.paired.forEach((g) => g.dispose())
    },
    [boneGeo, boneMat, nerveMat, cordMat, ribs, nerves],
  )

  useFrame((s) => {
    const g = root.current
    if (!g) return
    const gate = always ? 1 : lod.current.gate * 0.9
    g.visible = gate > 0.01
    if (!g.visible) return
    for (const m of [boneMat, nerveMat, cordMat]) {
      m.uniforms.uGate.value = gate
      m.uniforms.uTime.value = s.clock.elapsedTime
    }
    /* Les nerfs « respirent » doucement : l'influx nerveux. */
    const pulse = 0.85 + 0.15 * Math.sin(s.clock.elapsedTime * 3)
    nerveMat.uniforms.uGain.value = 1.7 * pulse
    cordMat.uniforms.uGain.value = 1.5 * pulse
  })

  const mesh = (b: Bone, mirrored: boolean, key: string) => {
    const rot = b.r ?? [0, 0, 0]
    return (
      <mesh
        key={key}
        geometry={boneGeo}
        material={boneMat}
        position={[mirrored ? -b.p[0] : b.p[0], b.p[1], b.p[2]]}
        rotation={[rot[0], mirrored ? -rot[1] : rot[1], mirrored ? -rot[2] : rot[2]]}
        scale={b.s}
        raycast={() => null}
      />
    )
  }

  return (
    <group ref={root} visible={false}>
      {bones.flatMap((b, i) => (b.mirror ? [mesh(b, false, `b${i}`), mesh(b, true, `m${i}`)] : [mesh(b, false, `b${i}`)]))}
      {ribs.map((g, i) => (
        <group key={`r${i}`}>
          <mesh geometry={g} material={boneMat} raycast={() => null} />
          <mesh geometry={g} material={boneMat} scale={[-1, 1, 1]} raycast={() => null} />
        </group>
      ))}
      {nerves.central.map((g, i) => (
        <mesh key={`c${i}`} geometry={g} material={cordMat} raycast={() => null} />
      ))}
      {nerves.paired.map((g, i) => (
        <group key={`n${i}`}>
          <mesh geometry={g} material={nerveMat} raycast={() => null} />
          <mesh geometry={g} material={nerveMat} scale={[-1, 1, 1]} raycast={() => null} />
        </group>
      ))}
    </group>
  )
}
