import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSoma } from '../../hooks/useSoma'
import type { Deadline, Task, TaskCategory } from '../../types'
import {
  CATEGORIES,
  buildKnowledgeGraph,
  buildTaskGraph,
  layoutGraph,
  mergeGraphs,
  type NeuralGraph,
  type NeuralNode,
} from '../../engine/neural'
import { axeOf, axePalette } from '../../engine/knowledge'
import { CATEGORY_COLOR, CATEGORY_LABEL, isOverdue, parseQuickAdd } from '../../engine/tasks'
import { isLowPower } from '../../engine/body'
import { saveTask } from '../../db/repo'
import { uid } from '../../db/db'
import { TaskEditor } from '../vie/TodoPanel'
import { DeadlineEditor } from '../vie/DeadlinesPanel'
import { NoteEditor, NoteReader } from '../knowledge/NoteViews'
import type { KnowledgeNote } from '../../types'

const NeuralScene = lazy(() => import('./NeuralScene'))

/**
 * Plongée dans le cerveau : le réseau de neurones de tes tâches.
 * Plein écran, au-dessus de l'app ; Échap, le bouton ou la molette arrière ramènent au corps.
 */
export default function NeuralOverlay({ onClose }: { onClose: () => void }) {
  const data = useSoma()
  type Mode = 'taches' | 'savoir' | 'tout'
  const [mode, setMode] = useState<Mode>(() => (data.notes.length ? 'tout' : 'taches'))
  const [axes, setAxes] = useState<string[] | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<KnowledgeNote | null>(null)
  const [cats, setCats] = useState<TaskCategory[]>(CATEGORIES)
  const [showDone, setShowDone] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [deadline, setDeadline] = useState<Deadline | null>(null)
  const [text, setText] = useState('')
  const [visible, setVisible] = useState(false)
  const low = useMemo(() => isLowPower(), [])

  const palette = useMemo(() => axePalette(data.notes), [data.notes])
  const allAxes = useMemo(() => [...palette.keys()], [palette])

  const graph = useMemo<NeuralGraph>(() => {
    const t = buildTaskGraph(data.tasks, data.deadlines, data.today, { categories: cats, showDone })
    const k = buildKnowledgeGraph(data.notes, { axes: axes ?? undefined })
    if (mode === 'taches') return t
    if (mode === 'savoir') return k
    return mergeGraphs(t, k)
  }, [mode, data.tasks, data.deadlines, data.notes, data.today, cats, showDone, axes])
  const positions = useMemo(() => layoutGraph(graph), [graph])

  const open = data.tasks.filter((t) => t.status !== 'fait')
  const late = open.filter((t) => isOverdue(t, data.today)).length
  const deadlines = graph.nodes.filter((n) => n.kind === 'deadline').length
  const noteCount = graph.nodes.filter((n) => n.kind === 'note').length

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    document.body.style.overflow = 'hidden'
    /* L'app derrière le réseau ne doit plus recevoir ni clic ni focus clavier. */
    const root = document.getElementById('root')
    if (root) root.inert = true
    return () => {
      cancelAnimationFrame(raf)
      if (root) root.inert = false
      document.body.style.overflow = ''
      document.body.style.cursor = ''
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !task && !deadline && !reading && !editingNote) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const close = () => {
    setVisible(false)
    window.setTimeout(onClose, 280)
  }

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
    } else if (n.kind === 'hub' && n.category) {
      /* Un clic sur une grande zone l'isole ; un second clic remet tout. */
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

  /**
   * Pastille d'axe : quand tout est affiché, un clic isole cet axe ; ensuite chaque clic
   * ajoute ou retire un axe. Un second clic sur l'axe seul remet tout.
   */
  function toggleAxe(slug: string, isolate = false) {
    setAxes((prev) => {
      if (prev === null || isolate) return prev && prev.length === 1 && prev[0] === slug ? null : [slug]
      if (prev.length === 1 && prev[0] === slug) return null
      const next = prev.includes(slug) ? prev.filter((x) => x !== slug) : [...prev, slug]
      return next.length === 0 || next.length === allAxes.length ? null : next
    })
  }

  const toggleCat = (c: TaskCategory) =>
    setCats((prev) => (prev.includes(c) ? (prev.length > 1 ? prev.filter((x) => x !== c) : prev) : [...prev, c]))

  return createPortal(
    <div
      role="dialog"
      aria-label="Réseau de neurones des tâches"
      className="fixed inset-0 z-[45] transition-opacity duration-300"
      style={{
        opacity: visible ? 1 : 0,
        background:
          'radial-gradient(70% 60% at 50% 45%, #0b2236 0%, #050b14 55%, #02050a 100%)',
      }}
    >
      <div className="absolute inset-0">
        <Suspense fallback={<div className="grid h-full place-items-center text-xs text-mist-700">Connexion des neurones…</div>}>
          <NeuralScene
            graph={graph}
            positions={positions}
            quality={low ? 'low' : 'high'}
            hovered={hovered}
            setHovered={setHovered}
            onPick={pick}
            onExit={close}
          />
        </Suspense>
      </div>

      {/* En-tête */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6"
        style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}
      >
        <div className="pointer-events-auto">
          <div className="text-[0.62rem] tracking-[0.22em] text-mist-500 uppercase">Cerveau · réseau</div>
          <h2 className="text-lg font-semibold text-mist-100 sm:text-xl">
            {mode === 'taches' ? 'Tes tâches' : mode === 'savoir' ? 'Ce que tu sais' : 'Tout ton cerveau'}
          </h2>
          <p className="text-xs text-mist-500">
            {mode !== 'savoir' && (
              <>
                {open.length} tâche{open.length > 1 ? 's' : ''}
                {late ? <span style={{ color: '#ffb02e' }}> ({late} en retard)</span> : null}
              </>
            )}
            {mode !== 'savoir' && noteCount > 0 ? ' · ' : ''}
            {mode !== 'taches' && `${noteCount} fiche${noteCount > 1 ? 's' : ''}`}
            {mode !== 'savoir' && deadlines ? ` · ${deadlines} échéance${deadlines > 1 ? 's' : ''}` : ''}
          </p>
          <div className="mt-2 inline-flex gap-0.5 rounded-xl bg-white/5 p-0.5 hairline" role="tablist" aria-label="Contenu du réseau">
            {(
              [
                ['tout', 'Tout'],
                ['taches', 'Tâches'],
                ['savoir', 'Savoir'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-xs transition ${
                  mode === m ? 'bg-accent/18 text-accent' : 'text-mist-500 hover:text-mist-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mode === 'taches' &&
              CATEGORIES.map((c) => {
                const on = cats.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => toggleCat(c)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] transition"
                    style={{
                      color: on ? CATEGORY_COLOR[c] : '#4f5f7a',
                      background: on ? `${CATEGORY_COLOR[c]}18` : '#ffffff06',
                      boxShadow: `inset 0 0 0 1px ${on ? `${CATEGORY_COLOR[c]}44` : '#ffffff12'}`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? CATEGORY_COLOR[c] : '#4f5f7a' }} />
                    {CATEGORY_LABEL[c]}
                  </button>
                )
              })}
            {mode !== 'taches' &&
              allAxes.map((slug) => {
                const info = axeOf(palette, slug)
                const on = axes === null || axes.includes(slug)
                return (
                  <button
                    key={slug}
                    onClick={() => toggleAxe(slug)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] transition"
                    style={{
                      color: on ? info.color : '#4f5f7a',
                      background: on ? `${info.color}18` : '#ffffff06',
                      boxShadow: `inset 0 0 0 1px ${on ? `${info.color}44` : '#ffffff12'}`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? info.color : '#4f5f7a' }} />
                    {info.label}
                  </button>
                )
              })}
            {mode !== 'savoir' && (
              <button
                onClick={() => setShowDone((v) => !v)}
                className="rounded-full px-2.5 py-1 text-[0.7rem] transition"
                style={{
                  color: showDone ? '#b9c8e0' : '#4f5f7a',
                  boxShadow: 'inset 0 0 0 1px #ffffff14',
                  background: showDone ? '#ffffff10' : '#ffffff06',
                }}
              >
                faites aujourd’hui
              </button>
            )}
          </div>
        </div>
        <button
          onClick={close}
          className="pointer-events-auto glass-strong shrink-0 rounded-xl px-3.5 py-2 text-sm text-mist-100"
        >
          Revenir au corps ✕
        </button>
      </div>

      {/* Ajout rapide + aide */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
          className="pointer-events-auto glass-strong flex w-full max-w-xl items-center gap-2 rounded-2xl px-4"
        >
          <span className="text-accent">+</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nouveau neurone… ex. réviser oral jeudi !haute #école"
            aria-label="Ajouter une tâche au réseau"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-mist-100 outline-none placeholder:text-mist-700"
          />
        </form>
        <p className="text-center text-[0.66rem] text-mist-700">
          Glisse pour tourner · molette ou pince pour zoomer · recule à fond (ou Échap) pour revenir au corps
        </p>
      </div>

      {task && <TaskEditor task={task} onClose={() => setTask(null)} />}
      {deadline && <DeadlineEditor deadline={deadline} onClose={() => setDeadline(null)} />}
      {reading && (
        <NoteReader
          noteId={reading}
          onClose={() => setReading(null)}
          onOpen={setReading}
          onIsolate={(slug) => {
            toggleAxe(slug, true)
            setReading(null)
            if (mode === 'taches') setMode('savoir')
          }}
          onEdit={(n) => {
            setReading(null)
            setEditingNote(n)
          }}
        />
      )}
      {editingNote && <NoteEditor note={editingNote} onClose={() => setEditingNote(null)} />}
    </div>,
    document.body,
  )
}
