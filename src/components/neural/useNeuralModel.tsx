import { useEffect, useMemo, useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Deadline, KnowledgeNote, Task, TaskCategory } from '../../types'
import {
  CATEGORIES,
  buildKnowledgeGraph,
  buildTaskGraph,
  layoutGraph,
  matchNodes,
  mergeGraphs,
  neighborhood,
  suggestLinks,
  withRoots,
  type NeuralGraph,
  type NeuralNode,
  type Vec3,
} from '../../engine/neural'
import { axeOf, axePalette } from '../../engine/knowledge'
import { isOverdue, parseQuickAdd } from '../../engine/tasks'
import { saveNote, saveTask } from '../../db/repo'
import { blip, setSoundEnabled, soundEnabled } from './sound'
import { addDayKey } from '../../engine/time'
import { uid } from '../../db/db'

export type NeuralMode = 'taches' | 'savoir' | 'tout' | 'jour'

const EMPTY: NeuralGraph = { nodes: [], links: [] }
const NO_POS = new Map<string, Vec3>()

/**
 * Tout ce qu'il faut pour afficher le réseau : graphe, placement 3D, filtres et actions.
 * Le calcul est différé d'un instant après l'ouverture pour ne pas ralentir l'affichage.
 */
export function useNeuralModel(enabled: boolean, deep = false) {
  const data = useSoma()
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<NeuralMode>('tout')
  const [axes, setAxes] = useState<string[] | null>(null)
  const [cats, setCats] = useState<TaskCategory[]>(CATEGORIES)
  const [opened, setOpened] = useState({ taches: false, echeances: false })
  const [showDone, setShowDone] = useState(false)
  const [hovered, setHoveredRaw] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tour, setTour] = useState(false)
  const [sound, setSoundState] = useState(soundEnabled)
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
    const full = mode === 'taches' || mode === 'jour'
    /* « Aujourd'hui » : ce qui est dû ou en retard, et les échéances de la semaine. */
    const inWeek = addDayKey(data.today, 7)
    const tasks = mode === 'jour' ? data.tasks.filter((x) => x.due && x.due <= data.today) : data.tasks
    const deadlines = mode === 'jour' ? data.deadlines.filter((d) => d.date <= inWeek) : data.deadlines
    const t = withRoots(buildTaskGraph(tasks, deadlines, data.today, { categories: cats, showDone }), {
      taches: full || opened.taches,
      echeances: full || opened.echeances,
    })
    if (mode === 'jour') return t
    const k = buildKnowledgeGraph(data.notes, { axes: axes ?? undefined }, data.today)
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

  /* ── Sélection, chemin, recherche ─────────────────────────────────── */

  const setHovered = (id: string | null) => {
    setHoveredRaw(id)
    if (id) {
      const n = graph.nodes.find((x) => x.id === id)
      if (n) blip(n.kind, true)
    }
  }
  /* Si le neurone sélectionné disparaît (filtre, mode), on désélectionne. */
  useEffect(() => {
    if (selected && !graph.nodes.some((n) => n.id === selected)) setSelected(null)
  }, [graph, selected])

  const matches = useMemo(() => matchNodes(graph, query), [graph, query])
  const path = useMemo(() => (selected ? neighborhood(graph, selected, 2) : null), [graph, selected])
  const focusSet = matches ?? path

  /* Synapses possibles entre fiches : visibles sur le réseau, proposées au survol. */
  const allSuggestions = useMemo(() => suggestLinks(data.notes, 10), [data.notes])
  const suggested = useMemo(() => {
    const ids = new Set(graph.nodes.map((n) => n.id))
    return allSuggestions.map((s) => ({ ...s, na: `note:${s.a}`, nb: `note:${s.b}` })).filter((s) => ids.has(s.na) && ids.has(s.nb))
  }, [allSuggestions, graph])

  const relier = async (a: string, b: string) => {
    const na = data.notes.find((n) => n.id === a)
    const nb = data.notes.find((n) => n.id === b)
    if (!na || !nb) return
    if (!na.links.includes(nb.title)) await saveNote({ ...na, links: [...na.links, nb.title], edited: true })
    if (!nb.links.includes(na.title)) await saveNote({ ...nb, links: [...nb.links, na.title], edited: true })
    blip('link')
  }

  /* Activité du jour : séances, tâches faites, check-in. */
  const activity = useMemo(() => {
    const w = data.workouts.filter((x) => x.day === data.today && !x.planned).length
    const d = data.tasks.filter((x) => x.status === 'fait' && x.completedAt?.slice(0, 10) === data.today).length
    return Math.min(1, (w * 1.5 + d + (data.checkinByDay.has(data.today) ? 1 : 0)) / 5)
  }, [data.workouts, data.tasks, data.checkinByDay, data.today])

  /* Visite guidée : le réseau tourne seul et s'arrête sur chaque grande zone. */
  useEffect(() => {
    if (!tour) return
    if (!deep) {
      setTour(false)
      return
    }
    const stops = graph.nodes.filter((n) => ['core', 'root', 'axe', 'hub'].includes(n.kind)).map((n) => n.id)
    if (!stops.length) return
    let i = 0
    setSelected(stops[0])
    const t = window.setInterval(() => {
      i = (i + 1) % stops.length
      setSelected(stops[i])
      const n = graph.nodes.find((x) => x.id === stops[i])
      if (n) blip(n.kind)
    }, 3800)
    return () => window.clearInterval(t)
  }, [tour, deep, graph])

  const setSound = (on: boolean) => {
    setSoundEnabled(on)
    setSoundState(on)
    if (on) blip('axe')
  }

  /** Premier tap : on sélectionne (chemin allumé, aperçu). Second tap : on ouvre. */
  const pick = (n: NeuralNode) => {
    setTour(false)
    if (n.kind !== 'root' && selected !== n.id) {
      setSelected(n.id)
      blip(n.kind)
      return
    }
    openNode(n)
  }

  const openNode = (n: NeuralNode) => {
    blip(n.kind)
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

  /* L'aperçu du neurone survolé ou sélectionné. */
  const previewNode = graph.nodes.find((n) => n.id === (hovered ?? selected)) ?? null
  const preview = useMemo(() => {
    if (!previewNode) return null
    const note = previewNode.noteId ? data.notes.find((x) => x.id === previewNode.noteId) : undefined
    const links = graph.links.filter((l) => l.source === previewNode.id || l.target === previewNode.id).length
    const sugg = previewNode.kind === 'note' && previewNode.noteId
      ? allSuggestions
          .filter((s) => s.a === previewNode.noteId || s.b === previewNode.noteId)
          .map((s) => {
            const otherId = s.a === previewNode.noteId ? s.b : s.a
            return { a: s.a, b: s.b, title: data.notes.find((x) => x.id === otherId)?.title ?? '', shared: s.shared }
          })
          .filter((s) => s.title)
      : []
    return {
      node: previewNode,
      lines: note ? [note.summary, ...note.facts.slice(0, 2).map((f) => f.text)].filter((x): x is string => !!x) : previewNode.summary ? [previewNode.summary] : [],
      links,
      suggestions: sugg.slice(0, 2),
      pinned: previewNode.id === selected,
    }
  }, [previewNode, selected, graph, data.notes, allSuggestions])

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
    graph, positions, hovered, setHovered, pick, openNode, labels, shownLabels,
    selected, setSelected, query, setQuery, focusSet, path, suggested, activity, preview, relier,
    tour, setTour, sound, setSound,
    open: open.length, late, deadlines, noteCount,
    text, setText, add,
    task, setTask, deadline, setDeadline, reading, setReading, editingNote, setEditingNote,
    anyModal: !!(task || deadline || reading || editingNote),
  }
}

export type NeuralModel = ReturnType<typeof useNeuralModel>
