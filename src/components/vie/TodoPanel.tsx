import { useMemo, useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Task, TaskCategory, TaskPriority, TaskStatus } from '../../types'
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  doneToday,
  dueLabel,
  isOverdue,
  parseQuickAdd,
  tasksForView,
  type TaskView,
} from '../../engine/tasks'
import { deleteTask, saveTask } from '../../db/repo'
import { uid } from '../../db/db'
import { Button, Field, Segmented, Sheet, TextArea, TextInput, useToast } from '../ui/primitives'

const VIEWS: { value: TaskView; label: string }[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'week', label: 'Semaine' },
  { value: 'overdue', label: 'En retard' },
  { value: 'all', label: 'Toutes' },
]

const EMPTY: Record<TaskView, string> = {
  today: 'Rien de prévu aujourd’hui.',
  week: 'Rien d’autre cette semaine.',
  overdue: 'Aucun retard. Bien joué.',
  all: 'Aucune tâche ouverte.',
}

const OVERDUE = '#ffb02e'

export default function TodoPanel({ initialView = 'today' }: { initialView?: TaskView }) {
  const data = useSoma()
  const [view, setView] = useState<TaskView>(initialView)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const preview = useMemo(() => (text.trim() ? parseQuickAdd(text, data.today) : null), [text, data.today])
  const counts = useMemo(
    () =>
      Object.fromEntries(
        VIEWS.map((v) => [v.value, tasksForView(data.tasks, v.value, data.today, data.settings.weekStartsOn).length]),
      ) as Record<TaskView, number>,
    [data.tasks, data.today, data.settings.weekStartsOn],
  )
  const list = useMemo(
    () => tasksForView(data.tasks, view, data.today, data.settings.weekStartsOn),
    [data.tasks, view, data.today, data.settings.weekStartsOn],
  )
  const done = useMemo(() => (view === 'today' ? doneToday(data.tasks, data.today) : []), [data.tasks, view, data.today])

  const add = async () => {
    if (!preview?.title) return
    const now = new Date().toISOString()
    await saveTask({
      id: uid('task'),
      title: preview.title,
      due: preview.due,
      dueTime: preview.dueTime,
      priority: preview.priority,
      category: preview.category,
      status: 'a_faire',
      createdAt: now,
      updatedAt: now,
    })
    setText('')
    /* La tâche créée doit rester visible : on bascule sur une vue qui la contient. */
    if (view === 'today' && preview.due !== data.today) setView(preview.due ? 'week' : 'all')
    if (view === 'overdue') setView(preview.due === data.today ? 'today' : 'all')
    inputRef.current?.focus()
  }

  const toggle = async (t: Task) => {
    const doneNow = t.status !== 'fait'
    await saveTask({
      ...t,
      status: doneNow ? 'fait' : 'a_faire',
      completedAt: doneNow ? new Date().toISOString() : undefined,
    })
    if (doneNow) toast.show('Tâche faite ✓')
  }

  return (
    <section aria-label="To-do list" className="glass relative overflow-hidden rounded-[var(--radius-card)]">
      {toast.node}
      {/* Ajout rapide : une ligne, Entrée, c'est créé */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="border-b border-white/8 p-3 sm:p-4"
      >
        <div className="flex items-center gap-2 rounded-xl bg-ink-900/70 px-3 hairline focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
          <span className="text-lg text-accent" aria-hidden>
            +
          </span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nouvelle tâche…  ex. rendu maths demain 14h !haute #école"
            aria-label="Ajouter une tâche"
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-mist-100 outline-none placeholder:text-mist-700"
            enterKeyHint="done"
          />
          {text && (
            <button type="submit" className="shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-xs text-accent">
              Entrée ↵
            </button>
          )}
        </div>
        {preview && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[0.68rem]">
            <span className="text-mist-500">Compris :</span>
            <span className="text-mist-100">{preview.title || '…'}</span>
            {preview.due && (
              <Chip color="#8fb4ff">
                {dueLabel({ due: preview.due, dueTime: preview.dueTime } as Task, data.today)}
              </Chip>
            )}
            {!preview.due && preview.dueTime && <Chip color="#8fb4ff">{preview.dueTime}</Chip>}
            <Chip color={CATEGORY_COLOR[preview.category]}>{CATEGORY_LABEL[preview.category]}</Chip>
            {preview.priority !== 'normale' && (
              <Chip color={preview.priority === 'haute' ? 'var(--accent)' : '#7c8dab'}>
                {PRIORITY_LABEL[preview.priority]}
              </Chip>
            )}
          </div>
        )}
      </form>

      {/* Vues */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 sm:px-4">
        <div role="tablist" className="scroll-x flex gap-1">
          {VIEWS.map((v) => {
            const active = v.value === view
            const late = v.value === 'overdue' && counts.overdue > 0
            return (
              <button
                key={v.value}
                role="tab"
                aria-selected={active}
                onClick={() => setView(v.value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  active ? 'bg-accent/15 text-accent' : 'text-mist-500 hover:text-mist-300'
                }`}
              >
                {v.label}
                <span
                  className="rounded-md px-1.5 text-[0.62rem] tnum"
                  style={{
                    background: late ? `${OVERDUE}22` : '#ffffff0d',
                    color: late ? OVERDUE : 'inherit',
                  }}
                >
                  {counts[v.value]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Les retards restent visibles depuis « Aujourd'hui », en une seule ligne discrète */}
      {view === 'today' && counts.overdue > 0 && (
        <button
          onClick={() => setView('overdue')}
          className="mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg px-3 py-2 text-left text-xs sm:mx-4 sm:w-[calc(100%-2rem)]"
          style={{ background: `${OVERDUE}12`, boxShadow: `inset 0 0 0 1px ${OVERDUE}33`, color: OVERDUE }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: OVERDUE }} />
          {counts.overdue} tâche{counts.overdue > 1 ? 's' : ''} en retard
          <span className="ml-auto text-mist-500">voir →</span>
        </button>
      )}

      <ul className="space-y-1 p-3 sm:p-4">
        {list.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={() => void toggle(t)} onOpen={() => setEditing(t)} />
        ))}
        {!list.length && <li className="py-6 text-center text-xs text-mist-700">{EMPTY[view]}</li>}
        {done.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={() => void toggle(t)} onOpen={() => setEditing(t)} />
        ))}
      </ul>

      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {children}
    </span>
  )
}

function TaskRow({ task, onToggle, onOpen }: { task: Task; onToggle: () => void; onOpen: () => void }) {
  const data = useSoma()
  const doneT = task.status === 'fait'
  const late = isOverdue(task, data.today)
  const label = dueLabel(task, data.today)
  return (
    <li
      className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/4 ${
        doneT ? 'opacity-45' : ''
      }`}
      style={late ? { boxShadow: `inset 2px 0 0 ${OVERDUE}` } : undefined}
    >
      <button
        onClick={onToggle}
        aria-label={doneT ? 'Marquer à faire' : 'Marquer comme faite'}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition active:scale-90"
        style={{
          boxShadow: `inset 0 0 0 1.5px ${doneT ? 'var(--accent)' : task.priority === 'haute' ? 'var(--accent)' : '#4f5f7a'}`,
          background: doneT ? 'var(--accent)' : 'transparent',
        }}
      >
        {doneT && (
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-ink-950">
            <path d="M5 10.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        )}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className={`block truncate text-sm ${doneT ? 'text-mist-500 line-through' : 'text-mist-100'} ${
            task.priority === 'haute' && !doneT ? 'font-medium' : ''
          } ${task.priority === 'basse' && !doneT ? 'text-mist-300' : ''}`}
        >
          {task.title}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[0.66rem] text-mist-700">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLOR[task.category] }} />
            {CATEGORY_LABEL[task.category]}
          </span>
          {label && <span style={late ? { color: OVERDUE } : undefined}>{label}</span>}
          {task.status === 'en_cours' && <span className="text-accent">en cours</span>}
          {task.source && <span>{task.source.kind === 'mail' ? '✉ mail' : '◷ agenda'}</span>}
        </span>
      </button>
      {task.priority === 'haute' && !doneT && (
        <span
          className="h-5 w-1 shrink-0 rounded-full"
          style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }}
          title="Priorité haute"
        />
      )}
    </li>
  )
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'fait', label: 'Fait' },
]

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const [t, setT] = useState<Task>(task)
  const patch = (p: Partial<Task>) => setT((prev) => ({ ...prev, ...p }))
  return (
    <Sheet
      open
      onClose={onClose}
      title="Tâche"
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            onClick={async () => {
              await saveTask({
                ...t,
                title: t.title.trim() || 'Sans titre',
                completedAt:
                  t.status === 'fait' ? (t.completedAt ?? new Date().toISOString()) : undefined,
              })
              onClose()
            }}
          >
            Enregistrer
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteTask(t.id)
              onClose()
            }}
          >
            Supprimer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Titre">
          <TextInput value={t.title} onChange={(e) => patch({ title: e.target.value })} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Échéance" optional>
            <TextInput type="date" value={t.due ?? ''} onChange={(e) => patch({ due: e.target.value || undefined })} />
          </Field>
          <Field label="Heure" optional>
            <TextInput
              type="time"
              value={t.dueTime ?? ''}
              onChange={(e) => patch({ dueTime: e.target.value || undefined })}
            />
          </Field>
        </div>
        <Field label="Priorité" group>
          <Segmented
            value={t.priority}
            onChange={(v) => patch({ priority: v as TaskPriority })}
            options={(['haute', 'normale', 'basse'] as TaskPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          />
        </Field>
        <Field label="Catégorie" group>
          <Segmented
            value={t.category}
            onChange={(v) => patch({ category: v as TaskCategory })}
            options={(['ecole', 'business', 'sport', 'perso'] as TaskCategory[]).map((c) => ({
              value: c,
              label: CATEGORY_LABEL[c],
            }))}
          />
        </Field>
        <Field label="Statut" group>
          <Segmented value={t.status} onChange={(v) => patch({ status: v as TaskStatus })} options={STATUS_OPTIONS} />
        </Field>
        <Field label="Notes" optional>
          <TextArea value={t.notes ?? ''} onChange={(e) => patch({ notes: (e.target as HTMLTextAreaElement).value })} />
        </Field>
        {t.source?.url && (
          <a
            href={t.source.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl bg-white/4 px-3 py-2.5 text-xs text-accent hairline"
          >
            Ouvrir la source ({t.source.kind === 'mail' ? 'mail' : 'événement'}) →
          </a>
        )}
      </div>
    </Sheet>
  )
}
