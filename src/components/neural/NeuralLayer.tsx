import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  backgroundNet,
  curveControl,
  hashString,
  type NeuralGraph,
  type NeuralNode,
  type Vec3,
} from '../../engine/neural'
import { createFilamentMaterial, createNeuronMaterial } from './neuralMaterials'

/* ──────────────────────────────────────────────────────────────────────────
   Le réseau de neurones vit DANS la scène du bonhomme, à l'intérieur de la
   tête, à l'échelle du crâne. Il n'y a donc ni page ni coupure : la caméra
   descend dans la tête, le corps s'estompe, les neurones apparaissent.
   ────────────────────────────────────────────────────────────────────────── */

/** Position du centre du cerveau dans le repère du corps. */
export const BRAIN_POS: Vec3 = [0, 1.638, 0.004]
/** Le réseau (≈ 1,5 unité de rayon) est réduit pour tenir dans le crâne. */
export const BRAIN_SCALE = 0.055

export interface DiveRef {
  focus: number
}

const SEGMENTS = 12

type CurveData = { pos: number[]; t: number[]; seed: number[]; col: number[] }
const emptyCurves = (): CurveData => ({ pos: [], t: [], seed: [], col: [] })

/** Échantillonne une courbe de Bézier quadratique en segments de lignes. */
function pushCurve(out: CurveData, a: Vec3, b: Vec3, ca: THREE.Color, cb: THREE.Color, seed: number, bend: number) {
  const c = curveControl(a, b, seed * 1e6, bend)
  const at = (u: number): Vec3 => {
    const v = 1 - u
    return [
      v * v * a[0] + 2 * v * u * c[0] + u * u * b[0],
      v * v * a[1] + 2 * v * u * c[1] + u * u * b[1],
      v * v * a[2] + 2 * v * u * c[2] + u * u * b[2],
    ]
  }
  const tmp = new THREE.Color()
  for (let i = 0; i < SEGMENTS; i++) {
    for (const u of [i / SEGMENTS, (i + 1) / SEGMENTS]) {
      const p = at(u)
      out.pos.push(p[0], p[1], p[2])
      out.t.push(u)
      out.seed.push(seed)
      tmp.copy(ca).lerp(cb, u)
      out.col.push(tmp.r, tmp.g, tmp.b)
    }
  }
}

function lineGeometry(data: CurveData) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(data.t, 1))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(data.seed, 1))
  g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3))
  return g
}

export const nodeColor = (n: NeuralNode) => (n.state === 'overdue' ? '#ffb02e' : n.state === 'done' ? '#4f5f7a' : n.color)

const nodePx = (n: NeuralNode) =>
  n.kind === 'core' ? 30 : n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' ? 24 : n.kind === 'deadline' ? 15 : n.kind === 'note' ? 9 * n.size : 11 * n.size

export interface NeuralLayerProps {
  graph: NeuralGraph
  positions: Map<string, Vec3>
  quality: 'high' | 'low'
  hovered: string | null
  setHovered: (id: string | null) => void
  onPick: (n: NeuralNode) => void
  dive: React.RefObject<DiveRef & { tilt: number }>
  /** Étiquettes DOM à positionner (id de neurone → élément). */
  labels: React.RefObject<Map<string, HTMLDivElement>>
  clickGuard: () => boolean
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export default function NeuralLayer(props: NeuralLayerProps) {
  const { graph, positions, quality, hovered, dive } = props
  const group = useRef<THREE.Group>(null)
  const fade = useRef(0)
  const widths = useRef(new WeakMap<HTMLDivElement, number>())
  /* Importance d'un neurone pour l'affichage de son nom : le survolé passe toujours devant. */
  const priority = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of graph.nodes) {
      const kindPri = n.kind === 'core' ? 500 : n.kind === 'root' ? 450 : n.kind === 'axe' ? 400 : n.kind === 'hub' ? 350 : 0
      m.set(n.id, kindPri + n.size * 10 + (['overdue', 'high', 'soon'].includes(n.state) ? 25 : 0) + (n.id === hovered ? 2000 : 0))
    }
    return m
  }, [graph, hovered])
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const net = useMemo(() => backgroundNet(quality === 'high' ? 300 : 160, 3, 11), [quality])

  const px = Math.min(2, gl.getPixelRatio())
  const bgMat = useMemo(() => createFilamentMaterial(0.11, 0.55, 0.12), [])
  const linkMat = useMemo(() => createFilamentMaterial(0.42, 1.0, 0.28), [])
  const hiMat = useMemo(() => createFilamentMaterial(0.85, 1.6, 0.45), [])
  const dotMat = useMemo(() => createNeuronMaterial(px, 5 * BRAIN_SCALE), [px])
  const nodeMat = useMemo(() => createNeuronMaterial(px, 9.5 * BRAIN_SCALE), [px])
  useEffect(
    () => () => {
      for (const m of [bgMat, linkMat, hiMat, dotMat, nodeMat]) m.dispose()
    },
    [bgMat, linkMat, hiMat, dotMat, nodeMat],
  )

  /* Cortex de fond : petits neurones décoratifs reliés à leurs voisins. */
  const bg = useMemo(() => {
    const data = emptyCurves()
    const ca = new THREE.Color('#35e3ff')
    const cb = new THREE.Color('#9b7bff')
    net.edges.forEach(([i, k], idx) => pushCurve(data, net.points[i], net.points[k], ca, cb, (idx * 0.618) % 1, 0.25))
    const pts = new THREE.BufferGeometry()
    pts.setAttribute('position', new THREE.Float32BufferAttribute(net.points.flat(), 3))
    const col = new THREE.Color('#7fd8ff')
    pts.setAttribute('color', new THREE.Float32BufferAttribute(net.points.flatMap(() => [col.r, col.g, col.b]), 3))
    pts.setAttribute('aSize', new THREE.Float32BufferAttribute(net.points.map((_, i) => 3.2 + (i % 5) * 0.7), 1))
    pts.setAttribute('aSeed', new THREE.Float32BufferAttribute(net.points.map((_, i) => (i * 0.37) % 1), 1))
    pts.setAttribute('aAlert', new THREE.Float32BufferAttribute(net.points.map(() => 0), 1))
    return { lines: lineGeometry(data), pts }
  }, [net])

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])

  const links = useMemo(() => {
    const data = emptyCurves()
    for (const l of graph.links) {
      const a = positions.get(l.source)
      const b = positions.get(l.target)
      const na = byId.get(l.source)
      const nb = byId.get(l.target)
      if (!a || !b || !na || !nb) continue
      const seed = (hashString(l.source + l.target) % 1000) / 1000
      pushCurve(data, a, b, new THREE.Color(nodeColor(na)), new THREE.Color(nodeColor(nb)), seed, l.kind === 'day' || l.kind === 'link' ? 0.35 : 0.15)
    }
    /* Chaque neurone de tâche ou de fiche plonge des fibres dans le cortex voisin. */
    for (const n of graph.nodes) {
      if (n.kind !== 'task' && n.kind !== 'deadline' && n.kind !== 'note') continue
      const p = positions.get(n.id)
      if (!p) continue
      const nearest = net.points
        .map((q, i) => [i, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2] as const)
        .sort((x, y) => x[1] - y[1])
        .slice(0, graph.nodes.length > 80 ? 1 : 2)
      for (const [i] of nearest) {
        pushCurve(data, p, net.points[i], new THREE.Color(nodeColor(n)), new THREE.Color('#35e3ff'), (hashString(n.id + i) % 1000) / 1000, 0.3)
      }
    }
    return lineGeometry(data)
  }, [graph, positions, net, byId])

  const highlight = useMemo(() => {
    if (!hovered) return null
    const data = emptyCurves()
    for (const l of graph.links) {
      if (l.source !== hovered && l.target !== hovered) continue
      const a = positions.get(l.source)
      const b = positions.get(l.target)
      const na = byId.get(l.source)
      const nb = byId.get(l.target)
      if (!a || !b || !na || !nb) continue
      pushCurve(data, a, b, new THREE.Color(nodeColor(na)), new THREE.Color(nodeColor(nb)), (hashString(l.source + l.target) % 1000) / 1000, 0.2)
    }
    return data.pos.length ? lineGeometry(data) : null
  }, [hovered, graph, positions, byId])

  const nodes = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const list = graph.nodes
    g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((n) => positions.get(n.id) ?? [0, 0, 0]), 3))
    g.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(
        list.flatMap((n) => {
          const c = new THREE.Color(nodeColor(n))
          return [c.r, c.g, c.b]
        }),
        3,
      ),
    )
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.map((n) => (n.id === hovered ? 1.5 : 1) * nodePx(n)), 1))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(list.map((n) => (hashString(n.id) % 1000) / 1000), 1))
    g.setAttribute('aAlert', new THREE.Float32BufferAttribute(list.map((n) => (n.state === 'overdue' ? 1 : n.state === 'soon' ? 0.5 : 0)), 1))
    return g
  }, [graph, positions, hovered])

  useEffect(() => () => bg.lines.dispose(), [bg])
  useEffect(() => () => links.dispose(), [links])
  useEffect(() => () => nodes.dispose(), [nodes])
  useEffect(() => () => highlight?.dispose(), [highlight])

  /* Zones de clic invisibles et projection des étiquettes. */
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 10, 8), [])
  const invisible = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), [])
  useEffect(
    () => () => {
      sphere.dispose()
      invisible.dispose()
    },
    [sphere, invisible],
  )
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame((s) => {
    const g = group.current
    if (!g) return
    const f = dive.current?.focus ?? 0
    /* Les neurones apparaissent pendant que le corps s'estompe : aucune coupure. */
    fade.current = smooth(0.34, 0.8, f)
    g.visible = fade.current > 0.004
    if (!g.visible) return
    g.rotation.x += ((dive.current?.tilt ?? 0) - g.rotation.x) * 0.12
    g.scale.setScalar(BRAIN_SCALE * (0.82 + 0.18 * fade.current))
    const t = s.clock.elapsedTime
    for (const m of [bgMat, linkMat, hiMat, dotMat, nodeMat]) {
      m.uniforms.uTime.value = t
      m.uniforms.uFade.value = fade.current
    }
    g.updateMatrixWorld()
    /* Étiquettes : on les place par ordre d'importance et on masque celles qui en chevauchent
       une déjà placée, pour que ça reste lisible même avec une centaine de neurones. */
    const micro = Math.max(0, Math.min(1, ((dive.current?.focus ?? 0) - 1) / 0.6))
    const items: { el: HTMLDivElement; x: number; y: number; op: number; pri: number; w: number }[] = []
    for (const [id, el] of props.labels.current ?? []) {
      const p = positions.get(id)
      if (!p) continue
      v.set(p[0], p[1], p[2]).applyMatrix4(g.matrixWorld).project(camera)
      if (v.z > 1) {
        el.style.opacity = '0'
        continue
      }
      let w = widths.current.get(el)
      if (!w) {
        w = el.offsetWidth || 60
        widths.current.set(el, w)
      }
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      const base = Math.max(0.2, Math.min(1, 1.5 - v.z * 25))
      items.push({ el, x, y, op: Math.max(base, micro) * fade.current, pri: priority.get(id) ?? 0, w })
    }
    items.sort((a, b) => b.pri - a.pri)
    const placed: [number, number, number, number][] = []
    for (const it of items) {
      const l = it.x - it.w / 2
      const r = it.x + it.w / 2
      const t0 = it.y - 30
      const b0 = it.y - 10
      const offscreen = r < 0 || l > size.width || b0 < 0 || t0 > size.height
      const clash = placed.some((q) => l < q[2] && r > q[0] && t0 < q[3] && b0 > q[1])
      if (offscreen || (clash && it.pri < 1000)) {
        it.el.style.opacity = '0'
        continue
      }
      placed.push([l, t0, r, b0])
      it.el.style.transform = `translate(-50%, -100%) translate(${it.x.toFixed(1)}px, ${(it.y - 10).toFixed(1)}px)`
      it.el.style.opacity = String(it.op)
    }
  })

  const ready = () => (dive.current?.focus ?? 0) > 0.6

  return (
    <group ref={group} position={BRAIN_POS} scale={BRAIN_SCALE} visible={false}>
      <lineSegments geometry={bg.lines} material={bgMat} />
      <points geometry={bg.pts} material={dotMat} />
      <lineSegments geometry={links} material={linkMat} />
      {highlight && <lineSegments geometry={highlight} material={hiMat} />}
      <points geometry={nodes} material={nodeMat} />
      {graph.nodes.map((n) => {
        const p = positions.get(n.id)
        if (!p) return null
        const r = n.kind === 'core' ? 0.14 : n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' ? 0.12 : 0.075
        return (
          <mesh
            key={n.id}
            geometry={sphere}
            material={invisible}
            position={p}
            scale={r * 1.4}
            onPointerOver={(e) => {
              if (!ready()) return
              e.stopPropagation()
              props.setHovered(n.id)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              props.setHovered(null)
              document.body.style.cursor = ''
            }}
            onClick={(e) => {
              if (!ready() || !props.clickGuard()) return
              e.stopPropagation()
              props.onPick(n)
            }}
          />
        )
      })}
    </group>
  )
}
