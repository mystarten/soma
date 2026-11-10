import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  backgroundNet,
  curveControl,
  hashString,
  type NeuralGraph,
  type NeuralNode,
  type Vec3,
} from '../../engine/neural'
import { createFilamentMaterial, createNeuronMaterial } from './neuralMaterials'

const SEGMENTS = 12

/** Échantillonne une courbe de Bézier quadratique en segments de lignes. */
function pushCurve(
  out: { pos: number[]; t: number[]; seed: number[]; col: number[] },
  a: Vec3,
  b: Vec3,
  ca: THREE.Color,
  cb: THREE.Color,
  seed: number,
  bend: number,
) {
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
    const u0 = i / SEGMENTS
    const u1 = (i + 1) / SEGMENTS
    for (const u of [u0, u1]) {
      const p = at(u)
      out.pos.push(p[0], p[1], p[2])
      out.t.push(u)
      out.seed.push(seed)
      tmp.copy(ca).lerp(cb, u)
      out.col.push(tmp.r, tmp.g, tmp.b)
    }
  }
}

function lineGeometry(data: { pos: number[]; t: number[]; seed: number[]; col: number[] }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(data.t, 1))
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(data.seed, 1))
  g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3))
  return g
}

const nodeColor = (n: NeuralNode) =>
  n.state === 'overdue' ? '#ffb02e' : n.state === 'done' ? '#4f5f7a' : n.color

const nodePx = (n: NeuralNode) =>
  n.kind === 'core' ? 30 : n.kind === 'hub' ? 24 : n.kind === 'deadline' ? 15 : 11 * n.size

/* ── Maillage de fond + filaments du graphe ─────────────────────────────── */

function Network({
  graph,
  positions,
  quality,
  hovered,
  fade,
}: {
  graph: NeuralGraph
  positions: Map<string, Vec3>
  quality: 'high' | 'low'
  hovered: string | null
  fade: React.RefObject<number>
}) {
  const gl = useThree((s) => s.gl)
  const net = useMemo(() => backgroundNet(quality === 'high' ? 300 : 160, 3, 11), [quality])

  const bgMat = useMemo(() => createFilamentMaterial(0.11, 0.55, 0.12), [])
  const linkMat = useMemo(() => createFilamentMaterial(0.42, 1.0, 0.28), [])
  const hiMat = useMemo(() => createFilamentMaterial(0.85, 1.6, 0.45), [])
  const dotMat = useMemo(() => createNeuronMaterial(Math.min(2, gl.getPixelRatio()), 5), [gl])
  const nodeMat = useMemo(() => createNeuronMaterial(Math.min(2, gl.getPixelRatio()), 9.5), [gl])

  useEffect(
    () => () => {
      for (const m of [bgMat, linkMat, hiMat, dotMat, nodeMat]) m.dispose()
    },
    [bgMat, linkMat, hiMat, dotMat, nodeMat],
  )

  /* Fond : neurones décoratifs reliés à leurs voisins. */
  const bg = useMemo(() => {
    const data = { pos: [] as number[], t: [] as number[], seed: [] as number[], col: [] as number[] }
    const ca = new THREE.Color('#35e3ff')
    const cb = new THREE.Color('#9b7bff')
    net.edges.forEach(([i, k], idx) => {
      pushCurve(data, net.points[i], net.points[k], ca, cb, (idx * 0.618) % 1, 0.25)
    })
    const lines = lineGeometry(data)
    const pts = new THREE.BufferGeometry()
    pts.setAttribute('position', new THREE.Float32BufferAttribute(net.points.flat(), 3))
    const col = new THREE.Color('#7fd8ff')
    pts.setAttribute('color', new THREE.Float32BufferAttribute(net.points.flatMap(() => [col.r, col.g, col.b]), 3))
    pts.setAttribute('aSize', new THREE.Float32BufferAttribute(net.points.map((_, i) => 3.2 + (i % 5) * 0.7), 1))
    pts.setAttribute('aSeed', new THREE.Float32BufferAttribute(net.points.map((_, i) => (i * 0.37) % 1), 1))
    pts.setAttribute('aAlert', new THREE.Float32BufferAttribute(net.points.map(() => 0), 1))
    return { lines, pts }
  }, [net])

  /* Graphe : liens du réseau + ancrage de chaque tâche dans le maillage. */
  const links = useMemo(() => {
    const data = { pos: [] as number[], t: [] as number[], seed: [] as number[], col: [] as number[] }
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    for (const l of graph.links) {
      const a = positions.get(l.source)
      const b = positions.get(l.target)
      const na = byId.get(l.source)
      const nb = byId.get(l.target)
      if (!a || !b || !na || !nb) continue
      const seed = (hashString(l.source + l.target) % 1000) / 1000
      pushCurve(data, a, b, new THREE.Color(nodeColor(na)), new THREE.Color(nodeColor(nb)), seed, l.kind === 'day' ? 0.35 : 0.15)
    }
    /* Chaque neurone de tâche plonge deux fibres dans le cortex voisin. */
    for (const n of graph.nodes) {
      if (n.kind !== 'task' && n.kind !== 'deadline') continue
      const p = positions.get(n.id)
      if (!p) continue
      const nearest = net.points
        .map((q, i) => [i, (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2] as const)
        .sort((x, y) => x[1] - y[1])
        .slice(0, 2)
      for (const [i] of nearest) {
        pushCurve(data, p, net.points[i], new THREE.Color(nodeColor(n)), new THREE.Color('#35e3ff'), (hashString(n.id + i) % 1000) / 1000, 0.3)
      }
    }
    return lineGeometry(data)
  }, [graph, positions, net])

  const highlight = useMemo(() => {
    if (!hovered) return null
    const data = { pos: [] as number[], t: [] as number[], seed: [] as number[], col: [] as number[] }
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    for (const l of graph.links) {
      if (l.source !== hovered && l.target !== hovered) continue
      const a = positions.get(l.source)
      const b = positions.get(l.target)
      const na = byId.get(l.source)
      const nb = byId.get(l.target)
      if (!a || !b || !na || !nb) continue
      pushCurve(data, a, b, new THREE.Color(nodeColor(na)), new THREE.Color(nodeColor(nb)), (hashString(l.source + l.target) % 1000) / 1000, l.kind === 'day' ? 0.35 : 0.15)
    }
    return data.pos.length ? lineGeometry(data) : null
  }, [hovered, graph, positions])

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

  useFrame((s) => {
    const t = s.clock.elapsedTime
    const f = fade.current ?? 1
    for (const m of [bgMat, linkMat, hiMat, dotMat, nodeMat]) {
      m.uniforms.uTime.value = t
      m.uniforms.uFade.value = f
    }
  })

  return (
    <group>
      <lineSegments geometry={bg.lines} material={bgMat} />
      <points geometry={bg.pts} material={dotMat} />
      <lineSegments geometry={links} material={linkMat} />
      {highlight && <lineSegments geometry={highlight} material={hiMat} />}
      <points geometry={nodes} material={nodeMat} />
    </group>
  )
}

/* ── Neurones interactifs : zones de clic + étiquettes ─────────────────── */

function Pickers({
  graph,
  positions,
  setHovered,
  onPick,
}: {
  graph: NeuralGraph
  positions: Map<string, Vec3>
  setHovered: (id: string | null) => void
  onPick: (n: NeuralNode) => void
}) {
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 10, 8), [])
  const invisible = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), [])
  useEffect(
    () => () => {
      sphere.dispose()
      invisible.dispose()
    },
    [sphere, invisible],
  )
  return (
    <group>
      {graph.nodes.map((n) => {
        const p = positions.get(n.id)
        if (!p) return null
        const r = n.kind === 'core' ? 0.14 : n.kind === 'hub' ? 0.12 : 0.075
        return (
          <group key={n.id} position={p}>
            <mesh
              geometry={sphere}
              material={invisible}
              scale={r}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHovered(n.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setHovered(null)
                document.body.style.cursor = ''
              }}
              onClick={(e) => {
                e.stopPropagation()
                onPick(n)
              }}
            />
          </group>
        )
      })}
    </group>
  )
}

/* ── Étiquettes : couche DOM au-dessus du canvas, projetée à chaque image ─ */

type LabelMap = React.RefObject<Map<string, HTMLDivElement>>

function LabelProjector({ positions, labels }: { positions: Map<string, Vec3>; labels: LabelMap }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const [id, el] of labels.current ?? []) {
      const p = positions.get(id)
      if (!p) continue
      v.set(p[0], p[1], p[2]).project(camera)
      const behind = v.z > 1
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${(y - 10).toFixed(1)}px)`
      el.style.opacity = behind ? '0' : String(Math.max(0.25, Math.min(1, 1.4 - v.z * 0.9)))
    }
  })
  return null
}

/* ── Caméra : plongée d'entrée, puis contrôle libre ───────────────────── */

function Intro({
  controls,
  fade,
  fit,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>
  fade: React.RefObject<number>
  fit: number
}) {
  const camera = useThree((s) => s.camera)
  const start = useRef<number | null>(null)
  useFrame((s) => {
    if (start.current === null) start.current = s.clock.elapsedTime
    const k = Math.min(1, (s.clock.elapsedTime - start.current) / 1.6)
    const e = 1 - (1 - k) ** 3
    fade.current = Math.min(1, k * 1.6)
    if (k < 1) {
      const dir = camera.position.clone().normalize()
      camera.position.copy(dir.multiplyScalar(0.6 + e * (fit - 0.6)))
      controls.current?.update()
    }
  })
  return null
}

function Throttle({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const t = window.setInterval(() => invalidate(), 1000 / fps)
    return () => window.clearInterval(t)
  }, [fps, invalidate])
  return null
}

export interface NeuralSceneProps {
  graph: NeuralGraph
  positions: Map<string, Vec3>
  quality: 'high' | 'low'
  hovered: string | null
  setHovered: (id: string | null) => void
  onPick: (n: NeuralNode) => void
  /** Molette arrière au recul maximal → sortie. */
  onExit: () => void
}

export default function NeuralScene(props: NeuralSceneProps) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const fade = useRef(0)
  const exitScore = useRef(0)
  const labels = useRef(new Map<string, HTMLDivElement>())
  /* Distance qui fait tenir tout le cerveau, en largeur comme en hauteur (fov 48°). */
  const fit = useMemo(() => {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight)
    return Math.max(3.4, 3.9 / aspect)
  }, [])
  const MAX = fit * 1.6

  /* Étiquettes permanentes : cœur, zones, et ce qui demande de l'attention (max 10). */
  const labelled = useMemo(() => {
    const leaves = props.graph.nodes.filter((n) => n.kind === 'task' || n.kind === 'deadline')
    const roomy = window.innerWidth >= 700
    const important =
      leaves.length <= (roomy ? 24 : 6)
        ? leaves
        : leaves.filter((n) => ['overdue', 'high', 'soon'].includes(n.state)).slice(0, roomy ? 12 : 5)
    return [...props.graph.nodes.filter((n) => n.kind === 'hub' || n.kind === 'core'), ...important]
  }, [props.graph])
  const hoveredNode = props.graph.nodes.find((n) => n.id === props.hovered)
  const shown = hoveredNode && !labelled.includes(hoveredNode) ? [...labelled, hoveredNode] : labelled

  return (
    <div className="relative h-full w-full">
    <Canvas
      dpr={props.quality === 'high' ? [1, 2] : [1, 1.5]}
      frameloop="demand"
      camera={{ position: [0.4, 0.35, 0.6], fov: 48, near: 0.02, far: 40 }}
      gl={{ antialias: props.quality === 'high', alpha: true, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
      onWheel={(e) => {
        const d = controls.current?.getDistance() ?? 0
        if (e.deltaY > 0 && d >= MAX - 0.05) {
          exitScore.current += e.deltaY / 400
          if (exitScore.current > 0.9) props.onExit()
        } else if (e.deltaY < 0) {
          exitScore.current = 0
        }
      }}
      onPointerMissed={() => props.setHovered(null)}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.1
      }}
    >
      <Throttle fps={props.quality === 'high' ? 60 : 30} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={Math.min(1.4, fit * 0.4)}
        maxDistance={MAX}
        autoRotate={!props.hovered}
        autoRotateSpeed={0.45}
        rotateSpeed={0.6}
        zoomSpeed={0.8}
      />
      <Intro controls={controls} fade={fade} fit={fit} />
      <Network graph={props.graph} positions={props.positions} quality={props.quality} hovered={props.hovered} fade={fade} />
      <Pickers graph={props.graph} positions={props.positions} setHovered={props.setHovered} onPick={props.onPick} />
      <LabelProjector positions={props.positions} labels={labels} />
      {props.quality === 'high' && (
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={0.55} luminanceThreshold={0.3} luminanceSmoothing={0.4} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {shown.map((n) => (
          <div
            key={n.id}
            ref={(el) => {
              if (el) labels.current.set(n.id, el)
              else labels.current.delete(n.id)
            }}
            className="absolute top-0 left-0 max-w-[220px] truncate rounded-md px-2 py-0.5 text-[11px] leading-tight whitespace-nowrap transition-[opacity] duration-200"
            style={{
              opacity: 0,
              color: n.kind === 'hub' ? n.color : n.state === 'overdue' ? '#ffb02e' : '#eaf2ff',
              background: props.hovered === n.id ? '#0b1626ee' : '#06101ccc',
              boxShadow: `0 0 0 1px ${n.kind === 'hub' ? `${n.color}55` : '#ffffff18'}`,
              fontWeight: n.kind === 'hub' || n.kind === 'core' ? 600 : 400,
              letterSpacing: n.kind === 'hub' ? '0.08em' : undefined,
              textTransform: n.kind === 'hub' ? 'uppercase' : undefined,
            }}
          >
            {n.kind === 'deadline' ? '◆ ' : ''}
            {n.label}
          </div>
        ))}
      </div>
    </div>
  )
}
