import type { DayKey, Deadline, KnowledgeNote, Task, TaskCategory } from '../types'
import { axeOf, axePalette, normTitle } from './knowledge'
import { CATEGORY_COLOR, CATEGORY_LABEL, isOverdue } from './tasks'

/* ──────────────────────────────────────────────────────────────────────────
   Réseau de neurones du cerveau : graphe des tâches (et plus tard des notes).
   Construction + placement 3D par forces, déterministe, sans React.
   ────────────────────────────────────────────────────────────────────────── */

export type NeuralKind = 'core' | 'root' | 'hub' | 'axe' | 'task' | 'deadline' | 'note'
export type NeuralState = 'normal' | 'high' | 'overdue' | 'done' | 'soon'

export interface NeuralNode {
  id: string
  kind: NeuralKind
  label: string
  color: string
  /** Taille relative (1 = tâche normale). */
  size: number
  state: NeuralState
  category?: TaskCategory
  /** Identifiant de la tâche ou de l'échéance d'origine. */
  ref?: string
  /** Axe de vie (fiches et grands axes). */
  axe?: string
  /** Fiche de connaissance liée (neurone « note », axe ou cœur). */
  noteId?: string
  /** Neurone principal replié (« Tâches », « Échéances ») : nombre d'éléments cachés dedans. */
  count?: number
  expanded?: boolean
  /** Direction de départ imposée pour le placement 3D. */
  anchor?: Vec3
}

export interface NeuralLink {
  source: string
  target: string
  kind: 'core' | 'hub' | 'day' | 'deadline' | 'axe' | 'link' | 'bridge'
  /** Longueur de repos du ressort. */
  rest: number
}

export interface NeuralGraph {
  nodes: NeuralNode[]
  links: NeuralLink[]
}

export type Vec3 = [number, number, number]

export const CATEGORIES: TaskCategory[] = ['ecole', 'business', 'sport', 'perso']

/** Direction de départ de chaque grande zone, pour une structure lisible. */
const HUB_ANCHOR: Record<TaskCategory, Vec3> = {
  ecole: [-0.85, 0.55, 0.35],
  business: [0.85, 0.55, 0.35],
  sport: [-0.75, -0.45, -0.25],
  perso: [0.75, -0.45, -0.25],
}

/** Forme du cerveau : deux hémisphères ellipsoïdaux. */
export const BRAIN = { rx: 0.95, ry: 1.0, rz: 1.3, gap: 0.5 }

export function insideBrain([x, y, z]: Vec3, margin = 1): boolean {
  const cx = x < 0 ? -BRAIN.gap : BRAIN.gap
  const dx = (x - cx) / (BRAIN.rx * margin)
  const dy = y / (BRAIN.ry * margin)
  const dz = z / (BRAIN.rz * margin)
  return dx * dx + dy * dy + dz * dz <= 1
}

/** Ramène un point à l'intérieur de son hémisphère s'il en sort. */
export function clampToBrain(p: Vec3, margin = 0.95): Vec3 {
  const cx = p[0] < 0 ? -BRAIN.gap : BRAIN.gap
  const ox = p[0] - cx
  const q = Math.sqrt(
    (ox / BRAIN.rx) ** 2 + (p[1] / BRAIN.ry) ** 2 + (p[2] / BRAIN.rz) ** 2,
  )
  if (q <= margin) return p
  const k = margin / q
  return [cx + ox * k, p[1] * k, p[2] * k]
}

export interface GraphFilter {
  categories?: TaskCategory[]
  showDone?: boolean
}

export function buildTaskGraph(
  tasks: Task[],
  deadlines: Deadline[],
  today: DayKey,
  filter: GraphFilter = {},
): NeuralGraph {
  const cats = filter.categories ?? CATEGORIES
  const nodes: NeuralNode[] = [
    { id: 'core', kind: 'core', label: 'Toi', color: '#eaf2ff', size: 2.2, state: 'normal' },
  ]
  const links: NeuralLink[] = []

  for (const c of cats) {
    nodes.push({
      id: `hub:${c}`,
      kind: 'hub',
      label: CATEGORY_LABEL[c],
      color: CATEGORY_COLOR[c],
      size: 1.7,
      state: 'normal',
      category: c,
    })
    links.push({ source: 'core', target: `hub:${c}`, kind: 'core', rest: 1.0 })
  }

  const live = tasks.filter(
    (t) =>
      !t.deleted &&
      cats.includes(t.category) &&
      (t.status !== 'fait' || (filter.showDone && t.completedAt?.slice(0, 10) === today)),
  )
  const byDay = new Map<string, string[]>()
  for (const t of live) {
    const state: NeuralState =
      t.status === 'fait' ? 'done' : isOverdue(t, today) ? 'overdue' : t.priority === 'haute' ? 'high' : 'normal'
    nodes.push({
      id: `task:${t.id}`,
      kind: 'task',
      label: t.title,
      color: CATEGORY_COLOR[t.category],
      size: state === 'high' || state === 'overdue' ? 1.25 : t.priority === 'basse' ? 0.75 : 1,
      state,
      category: t.category,
      ref: t.id,
    })
    links.push({ source: `hub:${t.category}`, target: `task:${t.id}`, kind: 'hub', rest: 0.55 })
    if (t.due && t.status !== 'fait') {
      const list = byDay.get(t.due) ?? []
      list.push(`task:${t.id}`)
      byDay.set(t.due, list)
    }
  }

  /* Les tâches du même jour sont reliées entre elles : une synapse par paire voisine. */
  for (const ids of byDay.values()) {
    for (let i = 1; i < ids.length; i++) links.push({ source: ids[i - 1], target: ids[i], kind: 'day', rest: 0.6 })
  }

  for (const d of deadlines) {
    if (d.deleted || d.done || d.date < today) continue
    const days = Math.round((Date.parse(d.date) - Date.parse(today)) / 86_400_000)
    const cat = d.category && cats.includes(d.category) ? d.category : null
    nodes.push({
      id: `deadline:${d.id}`,
      kind: 'deadline',
      label: d.title,
      color: days <= 7 ? '#ffc24b' : '#9fb6d6',
      size: days <= 7 ? 1.35 : 1.1,
      state: days <= 7 ? 'soon' : 'normal',
      category: cat ?? undefined,
      ref: d.id,
    })
    links.push({
      source: cat ? `hub:${cat}` : 'core',
      target: `deadline:${d.id}`,
      kind: 'deadline',
      rest: cat ? 0.7 : 0.9,
    })
  }
  return { nodes, links }
}

/* ── Graphe des connaissances ─────────────────────────────────────────── */

export interface KnowledgeFilter {
  /** Axes affichés ; `undefined` = tous. */
  axes?: string[]
}

const NOTE_SIZE: Record<string, number> = { area: 1.45, project: 1.25, person: 1.15, topic: 0.9, note: 0.9, doc: 1, hub: 1.7, profile: 2.2 }

/**
 * Chaque fiche est un neurone. La fiche « axe » d'un domaine (type hub) devient le grand
 * neurone de cet axe, la fiche « profil » devient le cœur, et les [[liens]] sont des synapses.
 */
export function buildKnowledgeGraph(notes: KnowledgeNote[], filter: KnowledgeFilter = {}): NeuralGraph {
  const live = notes.filter((n) => !n.deleted)
  const profile = live.find((n) => n.kind === 'profile')
  const nodes: NeuralNode[] = [
    { id: 'core', kind: 'core', label: 'Toi', color: '#eaf2ff', size: 2.2, state: 'normal', noteId: profile?.id },
  ]
  const links: NeuralLink[] = []

  /* Palette calculée sur toutes les fiches : filtrer ne change ni couleurs ni positions. */
  const palette = axePalette(live)
  const allAxes = [...palette.keys()]
  const shown = filter.axes ? allAxes.filter((a) => filter.axes!.includes(a)) : allAxes

  /* Quelle fiche est représentée par quel neurone (pour résoudre les liens). */
  const nodeOf = new Map<string, string>()
  if (profile) nodeOf.set(profile.id, 'core')

  for (const slug of shown) {
    const info = axeOf(palette, slug)
    const hubNote = live.find((n) => n.kind === 'hub' && n.axe === slug)
    nodes.push({
      id: `axe:${slug}`,
      kind: 'axe',
      label: hubNote?.title ?? info.label,
      color: info.color,
      size: 1.7,
      state: 'normal',
      axe: slug,
      noteId: hubNote?.id,
      anchor: info.anchor,
    })
    links.push({ source: 'core', target: `axe:${slug}`, kind: 'axe', rest: 1.0 })
    if (hubNote) nodeOf.set(hubNote.id, `axe:${slug}`)
  }

  for (const n of live) {
    if (n.kind === 'profile' || nodeOf.has(n.id)) continue
    if (n.axe && !shown.includes(n.axe)) continue
    if (!n.axe && filter.axes) continue
    const info = axeOf(palette, n.axe)
    const verify = n.facts.some((f) => f.status === 'verify')
    nodes.push({
      id: `note:${n.id}`,
      kind: 'note',
      label: n.title,
      color: n.axe ? info.color : '#9fb6d6',
      size: NOTE_SIZE[n.kind] ?? 1,
      state: verify ? 'soon' : n.kind === 'area' ? 'high' : 'normal',
      axe: n.axe,
      noteId: n.id,
      anchor: n.axe ? info.anchor : undefined,
    })
    nodeOf.set(n.id, `note:${n.id}`)
    links.push({
      source: n.axe ? `axe:${n.axe}` : 'core',
      target: `note:${n.id}`,
      kind: 'axe',
      rest: n.kind === 'area' ? 0.7 : 0.6,
    })
  }

  /* Synapses : les liens [[...]] entre fiches, une seule fois par paire. */
  const byTitle = new Map(live.map((n) => [normTitle(n.title), n]))
  const seen = new Set<string>()
  for (const n of live) {
    const a = nodeOf.get(n.id)
    if (!a) continue
    for (const l of n.links) {
      const t = byTitle.get(normTitle(l))
      const b = t ? nodeOf.get(t.id) : undefined
      if (!t || !b || a === b) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ source: a, target: b, kind: 'link', rest: 0.95 })
    }
  }
  return { nodes, links }
}

/** Mots (français et anglais courants) qui rapprochent une catégorie de tâches d'un axe. */
const BRIDGE_WORDS: Record<TaskCategory, RegExp> = {
  ecole: /\b(?:etude|ecole|school|cours\b|scolar|univers|campus)/,
  business: /\b(?:entrepren|business|travail|pro\b|profession|carriere|work)/,
  sport: /\b(?:sport|fitness|training|entrainement|physique)/,
  perso: /\b(?:perso|personnel|famille|loisir|voyage|bien-etre)/,
}

/** L'axe qui correspond à une catégorie de tâches, s'il y en a un. */
export function bridgeAxeFor(category: TaskCategory, axeSlugs: string[]): string | undefined {
  return axeSlugs.find((s) => BRIDGE_WORDS[category].test(normTitle(s)))
}

/**
 * Regroupe les tâches sous un neurone principal « Tâches » et les échéances sous « Échéances ».
 * Replié, seul le neurone principal reste ; déplié, tout son contenu apparaît autour de lui.
 */
export function withRoots(g: NeuralGraph, open: { taches: boolean; echeances: boolean }): NeuralGraph {
  const isTask = (k: NeuralKind) => k === 'task' || k === 'hub'
  const nT = g.nodes.filter((n) => n.kind === 'task').length
  const nD = g.nodes.filter((n) => n.kind === 'deadline').length
  const nodes: NeuralNode[] = g.nodes.filter(
    (n) => !(isTask(n.kind) && !open.taches) && !(n.kind === 'deadline' && !open.echeances),
  )
  nodes.push(
    { id: 'root:taches', kind: 'root', label: 'Tâches', color: '#7fd6ff', size: 1.9, state: 'normal', count: nT, expanded: open.taches, anchor: [-0.15, 0.85, 0.15] },
    { id: 'root:echeances', kind: 'root', label: 'Échéances', color: '#ffc24b', size: 1.7, state: 'normal', count: nD, expanded: open.echeances, anchor: [0.15, -0.8, 0.35] },
  )
  const ids = new Set(nodes.map((n) => n.id))
  const links: NeuralLink[] = [
    { source: 'core', target: 'root:taches', kind: 'core', rest: 1.0 },
    { source: 'core', target: 'root:echeances', kind: 'core', rest: 1.0 },
  ]
  for (const l of g.links) {
    if (!ids.has(l.source) || !ids.has(l.target)) continue
    if (l.kind === 'core' && l.target.startsWith('hub:')) links.push({ ...l, source: 'root:taches' })
    else if (l.kind === 'deadline') links.push({ ...l, source: 'root:echeances' })
    else links.push(l)
  }
  return { nodes, links }
}

export function mergeGraphs(tasks: NeuralGraph, knowledge: NeuralGraph): NeuralGraph {
  const nodes = new Map<string, NeuralNode>()
  for (const n of [...tasks.nodes, ...knowledge.nodes]) {
    const prev = nodes.get(n.id)
    /* Le cœur garde la fiche « profil » si elle existe. */
    nodes.set(n.id, prev ? { ...prev, ...n, noteId: n.noteId ?? prev.noteId } : n)
  }
  const links = [...tasks.links, ...knowledge.links]
  const axeSlugs = knowledge.nodes.filter((n) => n.kind === 'axe' && n.axe).map((n) => n.axe!)
  const taken = new Set<string>()
  for (const cat of CATEGORIES) {
    const axe = bridgeAxeFor(cat, axeSlugs.filter((s) => !taken.has(s)))
    if (axe && nodes.has(`hub:${cat}`) && nodes.has(`axe:${axe}`)) {
      taken.add(axe)
      links.push({ source: `hub:${cat}`, target: `axe:${axe}`, kind: 'bridge', rest: 0.8 })
    }
  }
  return { nodes: [...nodes.values()], links }
}

/* ── Hasard déterministe ──────────────────────────────────────────────── */

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed: number) {
  let a = seed || 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── Placement par forces ─────────────────────────────────────────────── */

export function layoutGraph(graph: NeuralGraph, iterations = 240): Map<string, Vec3> {
  const pos = new Map<string, Vec3>()
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]))
  const P: Vec3[] = graph.nodes.map((n) => {
    const r = rng(hashString(n.id))
    const j = (k: number) => (r() - 0.5) * k
    if (n.kind === 'core') return [0, 0, 0]
    if (n.kind === 'hub' && n.category) {
      const a = HUB_ANCHOR[n.category]
      return [a[0] * 0.7, a[1] * 0.7, a[2] * 0.7]
    }
    if ((n.kind === 'axe' || n.kind === 'root') && n.anchor) return [n.anchor[0] * 0.95, n.anchor[1] * 0.95, n.anchor[2] * 0.95]
    const a = n.anchor ?? (n.category ? HUB_ANCHOR[n.category] : ([0, 0.2, 0] as Vec3))
    return [a[0] + j(0.6), a[1] + j(0.6), a[2] + j(0.6)]
  })
  const V: Vec3[] = P.map(() => [0, 0, 0])
  const N = P.length

  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations
    const F: Vec3[] = P.map(() => [0, 0, 0])
    /* Répulsion */
    for (let i = 0; i < N; i++) {
      for (let k = i + 1; k < N; k++) {
        const dx = P[i][0] - P[k][0]
        const dy = P[i][1] - P[k][1]
        const dz = P[i][2] - P[k][2]
        const d2 = Math.max(0.01, dx * dx + dy * dy + dz * dz)
        const f = (0.012 * Math.min(1, 40 / N)) / d2
        F[i][0] += dx * f
        F[i][1] += dy * f
        F[i][2] += dz * f
        F[k][0] -= dx * f
        F[k][1] -= dy * f
        F[k][2] -= dz * f
      }
    }
    /* Ressorts */
    for (const l of graph.links) {
      const a = index.get(l.source)
      const b = index.get(l.target)
      if (a === undefined || b === undefined) continue
      const dx = P[b][0] - P[a][0]
      const dy = P[b][1] - P[a][1]
      const dz = P[b][2] - P[a][2]
      const d = Math.max(0.001, Math.hypot(dx, dy, dz))
      const f = (d - l.rest) * 0.06
      F[a][0] += (dx / d) * f
      F[a][1] += (dy / d) * f
      F[a][2] += (dz / d) * f
      F[b][0] -= (dx / d) * f
      F[b][1] -= (dy / d) * f
      F[b][2] -= (dz / d) * f
    }
    /* Ancrage des grandes zones et confinement dans le cerveau */
    for (let i = 0; i < N; i++) {
      const n = graph.nodes[i]
      if (n.kind === 'core') {
        P[i] = [0, 0, 0]
        continue
      }
      if (n.kind === 'hub' && n.category) {
        const a = HUB_ANCHOR[n.category]
        F[i][0] += (a[0] * 0.7 - P[i][0]) * 0.08
        F[i][1] += (a[1] * 0.7 - P[i][1]) * 0.08
        F[i][2] += (a[2] * 0.7 - P[i][2]) * 0.08
      }
      if ((n.kind === 'axe' || n.kind === 'root') && n.anchor) {
        F[i][0] += (n.anchor[0] * 0.95 - P[i][0]) * 0.08
        F[i][1] += (n.anchor[1] * 0.95 - P[i][1]) * 0.08
        F[i][2] += (n.anchor[2] * 0.95 - P[i][2]) * 0.08
      }
      if (!insideBrain(P[i], 0.92)) {
        F[i][0] -= P[i][0] * 0.05
        F[i][1] -= P[i][1] * 0.05
        F[i][2] -= P[i][2] * 0.05
      }
      for (let c = 0; c < 3; c++) {
        V[i][c] = (V[i][c] + F[i][c]) * 0.6
        P[i][c] += V[i][c] * cool
      }
      P[i] = clampToBrain(P[i])
    }
  }
  graph.nodes.forEach((n, i) => pos.set(n.id, P[i]))
  return pos
}

/* ── Maillage de fond (neurones décoratifs) ───────────────────────────── */

export interface BackgroundNet {
  points: Vec3[]
  edges: [number, number][]
}

/** Points répartis dans le cerveau, chacun relié à ses plus proches voisins. */
export function backgroundNet(count: number, neighbours = 3, seed = 7): BackgroundNet {
  const r = rng(seed)
  const points: Vec3[] = []
  let guard = 0
  while (points.length < count && guard++ < count * 40) {
    const p: Vec3 = [(r() * 2 - 1) * 1.6, (r() * 2 - 1) * 1.1, (r() * 2 - 1) * 1.4]
    /* Densité plus forte vers la surface : le cortex. */
    if (insideBrain(p) && (!insideBrain(p, 0.7) || r() < 0.35)) points.push(p)
  }
  const edges: [number, number][] = []
  const seen = new Set<string>()
  for (let i = 0; i < points.length; i++) {
    const d = points
      .map((q, k) => [k, (q[0] - points[i][0]) ** 2 + (q[1] - points[i][1]) ** 2 + (q[2] - points[i][2]) ** 2] as const)
      .filter(([k]) => k !== i)
      .sort((a, b) => a[1] - b[1])
      .slice(0, neighbours)
    for (const [k] of d) {
      const key = i < k ? `${i}-${k}` : `${k}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([i, k])
    }
  }
  return { points, edges }
}

/** Point de contrôle d'un filament courbe entre deux neurones (léger arc). */
export function curveControl(a: Vec3, b: Vec3, seed: number, bend = 0.18): Vec3 {
  const r = rng(seed)
  const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  return [m[0] + (r() - 0.5) * len * bend * 2, m[1] + (r() - 0.5) * len * bend * 2, m[2] + (r() - 0.5) * len * bend * 2]
}
