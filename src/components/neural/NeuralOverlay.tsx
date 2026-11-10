import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSoma } from '../../hooks/useSoma'
import type { Deadline, Task, TaskCategory } from '../../types'
import { CATEGORIES, buildTaskGraph, layoutGraph, type NeuralNode } from '../../engine/neural'
import { CATEGORY_COLOR, CATEGORY_LABEL, isOverdue, parseQuickAdd } from '../../engine/tasks'
import { isLowPower } from '../../engine/body'
import { saveTask } from '../../db/repo'
import { uid } from '../../db/db'
import { TaskEditor } from '../vie/TodoPanel'
import { DeadlineEditor } from '../vie/DeadlinesPanel'

const NeuralScene = lazy(() => import('./NeuralScene'))

/**
 * Plongée dans le cerveau : le réseau de neurones de tes tâches.
 * Plein écran, au-dessus de l'app ; Échap, le bouton ou la molette arrière ramènent au corps.
 */
export default function NeuralOverlay({ onClose }: { onClose: () => void }) {
  const data = useSoma()
  const [cats, setCats] = useState<TaskCategory[]>(CATEGORIES)
  const [showDone, setShowDone] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [deadline, setDeadline] = useState<Deadline | null>(null)
  const [text, setText] = useState('')
  const [visible, setVisible] = useState(false)
  const low = useMemo(() => isLowPower(), [])

  const graph = useMemo(
    () => buildTaskGraph(data.tasks, data.deadlines, data.today, { categories: cats, showDone }),
    [data.tasks, data.deadlines, data.today, cats, showDone],
  )
  const positions = useMemo(() => layoutGraph(graph), [graph])

  const open = data.tasks.filter((t) => t.status !== 'fait')
  const late = open.filter((t) => isOverdue(t, data.today)).length
  const deadlines = graph.nodes.filter((n) => n.kind === 'deadline').length

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
      if (e.key === 'Escape' && !task && !deadline) close()
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
          <h2 className="text-lg font-semibold text-mist-100 sm:text-xl">Tes tâches</h2>
          <p className="text-xs text-mist-500">
            {open.length} ouverte{open.length > 1 ? 's' : ''}
            {late ? <span style={{ color: '#ffb02e' }}> · {late} en retard</span> : null}
            {deadlines ? ` · ${deadlines} échéance${deadlines > 1 ? 's' : ''}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
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
    </div>,
    document.body,
  )
}
