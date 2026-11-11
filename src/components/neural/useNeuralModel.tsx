import { useEffect, useMemo, useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Deadline, KnowledgeNote, Task, TaskCategory } from '../../types'
import {
  CATEGORIES,
  buildKnowledgeGraph,
  buildTaskGraph,
  layoutGraph,
  mergeGraphs,
  withRoots,
  type NeuralGraph,
  type NeuralNode,
  type Vec3,
} from '../../engine/neural'
import { axeOf, axePalette } from '../../engine/knowledge'
import { isOverdue, parseQuickAdd } from '../../engine/tasks'
import { saveTask } from '../../db/repo'
import { uid } from '../../db/db'

export type NeuralMode = 'taches' | 'savoir' | 'tout'

const EMPTY: NeuralGraph = { nodes: [], links: [] }
const NO_POS = new Map<string, Vec3>()

/**
 * Tout ce qu'il faut pour afficher le réseau : graphe, placement 3D, filtres et actions.
 * Le calcul est différé d'un instant après l'ouverture pour ne pas ralentir l'affichage.
 */
export function useNeuralModel(enabled: boolean) {
  const data = useSoma()
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<NeuralMode>('tout')
  const [axes, setAxes] = useState<string[] | null>(null)
  const [cats, setCats] = useState<TaskCategory[]>(CATEGORIES)
  const [opened, setOpened] = useState({ taches: false, echeances: false })
  const [showDone, setShowDone] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [deadline, setDeadline] = useState<Deadline | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<KnowledgeNote | null>(null)
  const [text, setText] = useState('')
  const labels = useRef(new Map<string, HTMLDivElement>())

  useEffect(() => {
    if (!enabled) return
    const t = window.setTimeout(() => setReady(true), 700)
    return () => window.clearTimeout(t)
  }, [enabled])

  /* Au premier affichage : s'il y a des fiches, on montre tout ; sinon seulement les tâches. */
  const decided = useRef(false)
  useEffect(() => {
    if (decided.current || !ready) return
    decided.current = true
    setMode(data.notes.length ? 'tout' : 'taches')
  }, [ready, data.notes.length])

  const palette = useMemo(() => axePalette(data.notes), [data.notes])
  const allAxes = useMemo(() => [...palette.keys()], [palette])

  const graph = useMemo<NeuralGraph>(() => {
    if (!enabled || !ready) return EMPTY
    const full = mode === 'taches'
    const t = withRoots(buildTaskGraph(data.tasks, data.deadlines, data.today, { categories: cats, showDone }), {
      taches: full || opened.taches,
      echeances: full || opened.echeances,
    })
    const k = buildKnowledgeGraph(data.notes, { axes: axes ?? undefined })
    return mode === 'taches' ? t : mode === 'savoir' ? k : mergeGraphs(t, k)
  }, [enabled, ready, mode, data.tasks, data.deadlines, data.notes, data.today, cats, showDone, axes, opened])

  const positions = useMemo(() => (graph.nodes.length ? layoutGraph(graph) : NO_POS), [graph])

  const open = data.tasks.filter((t) => t.status !== 'fait')
  const late = open.filter((t) => isOverdue(t, data.today)).length
  const deadlines = graph.nodes.find((n) => n.id === 'root:echeances')?.count ?? 0
  const noteCount = graph.nodes.filter((n) => n.kind === 'note').length

  /** Étiquettes toujours visibles : le cœur, les grands neurones, et ce qui demande de l'attention. */
  const labelled = useMemo(() => {
    const leaves = graph.nodes.filter((n) => n.kind === 'task' || n.kind === 'deadline' || n.kind === 'note')
    const roomy = typeof window === 'undefined' || window.innerWidth >= 700
    const rank = (n: NeuralNode) => (['overdue', 'high', 'soon'].includes(n.state) ? 10 : 0) + n.size
    const important = [...leaves].sort((a, b) => rank(b) - rank(a)).slice(0, roomy ? 400 : 160)
    return [...graph.nodes.filter((n) => n.kind === 'hub' || n.kind === 'axe' || n.kind === 'core' || n.kind === 'root'), ...important]
  }, [graph])
  const hoveredNode = graph.nodes.find((n) => n.id === hovered)
  const shownLabels = hoveredNode && !labelled.includes(hoveredNode) ? [...labelled, hoveredNode] : labelled

  /**
   * Pastille d'axe : quand tout est affiché, un clic isole cet axe ; ensuite chaque clic
   * ajoute ou retire un axe. Un second clic sur l'axe seul remet tout.
   */
  const toggleAxe = (slug: string, isolate = false) =>
    setAxes((prev) => {
      if (prev === null || isolate) return prev && prev.length === 1 && prev[0] === slug ? null : [slug]
      if (prev.length === 1 && prev[0] === slug) return null
      const next = prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]
      return next.length === 0 || next.length === allAxes.length ? null : next
    })

  const toggleCat = (c: TaskCategory) =>
    setCats((prev) => (prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c]))

  const pick = (n: NeuralNode) => {
    if (n.kind === 'task') {
      const t = data.tasks.find((x) => x.id === n.ref)
      if (t) setTask(t)
    } else if (n.kind === 'deadline') {
      const d = data.deadlines.find((x) => x.id === n.ref)
      if (d) setDeadline(d)
    } else if ((n.kind === 'note' || n.kind === 'axe' || n.kind === 'core') && n.noteId) {
      setReading(n.noteId)
    } else if (n.kind === 'axe' && n.axe) {
      toggleAxe(n.axe, true)
    } else if (n.kind === 'root') {
      const key = n.id === 'root:taches' ? 'taches' : 'echeances'
      setOpened((o) => ({ ...o, [key]: !o[key] }))
    } else if (n.kind === 'hub' && n.category) {
      /* Un clic sur une grande zone de tâches l'isole ; un second clic remet tout. */
      setCats((prev) => (prev.length === 1 && prev[0] === n.category ? CATEGORIES : [n.category!]))
    }
  }

  const add = async () => {
    const p = parseQuickAdd(text, data.today)
    if (!p.title) return
    setText('')
    if (!cats.includes(p.category)) setCats((c) => [...c, p.category])
    const now = new Date().toISOString()
    await saveTask({ id: uid('task'), ...p, status: 'a_faire', createdAt: now, updatedAt: now })
  }

  return {
    mode, setMode, axes, cats, showDone, setShowDone, toggleAxe, toggleCat,
    palette, allAxes, axeOf: (slug: string) => axeOf(palette, slug),
    graph, positions, hovered, setHovered, pick, labels, shownLabels,
    open: open.length, late, deadlines, noteCount,
    text, setText, add,
    task, setTask, deadline, setDeadline, reading, setReading, editingNote, setEditingNote,
    anyModal: !!(task || deadline || reading || editingNote),
  }
}

export type NeuralModel = ReturnType<typeof useNeuralModel>
