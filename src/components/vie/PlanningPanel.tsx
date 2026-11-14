import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { Deadline, Task, TaskCategory, TaskKind } from '../../types'
import { CATEGORY_COLOR, CATEGORY_LABEL, KIND_ICON, KIND_LABEL, dueLabel, parseQuickAdd } from '../../engine/tasks'
import { groupPlan, planItems, type PlanItem } from '../../engine/planning'
import { addDayKey, parseDay } from '../../engine/time'
import { deleteTask, saveDeadline, saveTask } from '../../db/repo'
import { uid } from '../../db/db'
import KindPicker from './KindPicker'
import CategoryChips from './CategoryChips'
import { TaskEditor } from './TodoPanel'
import { DeadlineEditor } from './DeadlinesPanel'

/* Un seul endroit pour tout ce qui est à venir : tâches et échéances, avec jour, heure et catégories.
   Ce qui est passé quitte la liste d'elle-même. */

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export default function PlanningPanel() {
  const data = useSoma()
  const [text, setText] = useState('')
  const [pickedKind, setPickedKind] = useState<TaskKind | null>(null)
  const [pickedCats, setPickedCats] = useState<TaskCategory[]>([])
  const [pickedDay, setPickedDay] = useState('')
  const [pickedTime, setPickedTime] = useState('')
  const [options, setOptions] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editDeadline, setEditDeadline] = useState<Deadline | null>(null)
  const [showPast, setShowPast] = useState(false)

  const nowHm = hm(new Date(data.nowMs))
  const { groups, past } = useMemo(
    () => groupPlan(planItems(data.tasks, data.deadlines), data.today, nowHm),
    [data.tasks, data.deadlines, data.today, nowHm],
  )
  const preview = useMemo(() => (text.trim() ? parseQuickAdd(text, data.today) : null), [text, data.today])

  const add = async () => {
    const p = preview
    if (!p?.title) return
    const cats = pickedCats.length ? pickedCats : p.categories
    const now = new Date().toISOString()
    const row: Task = {
      id: uid('task'),
      title: p.title,
      due: pickedDay || p.due,
      dueTime: pickedTime || p.dueTime,
      priority: p.priority,
      category: cats[0] ?? 'perso',
      categories: cats,
      kind: pickedKind ?? p.kind,
      status: 'a_faire',
      createdAt: now,
      updatedAt: now,
    }
    /* On vide tout de suite : ce que tu tapes ensuite ne doit jamais être effacé. */
    setText('')
    setPickedKind(null)
    setPickedCats([])
    setPickedDay('')
    setPickedTime('')
    await saveTask(row)
  }

  const complete = async (i: PlanItem) => {
    if (i.source === 'task') {
      const t = i.raw as Task
      await saveTask({ ...t, status: 'fait', completedAt: new Date().toISOString() })
    } else {
      await saveDeadline({ ...(i.raw as Deadline), done: true })
    }
  }

  const dayText = (i: PlanItem) => {
    if (!i.day) return ''
    const d = parseDay(i.day)
    const base = i.day === data.today ? '' : i.day === addDayKey(data.today, 1) ? '' : format(d, 'EEE d MMM', { locale: fr })
    return [base, i.time].filter(Boolean).join(' · ')
  }

  const Row = ({ i }: { i: PlanItem }) => (
    <li className="group flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-white/4">
      <button
        onClick={() => void complete(i)}
        aria-label={`Terminer ${i.title}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition active:scale-90"
        style={{ boxShadow: `inset 0 0 0 1.5px ${i.priority === 'haute' ? 'var(--accent)' : '#4f5f7a'}` }}
      />
      <button
        onClick={() => (i.source === 'task' ? setEditTask(i.raw as Task) : setEditDeadline(i.raw as Deadline))}
        className="min-w-0 flex-1 text-left"
      >
        <span className={`block truncate text-sm text-mist-100 ${i.priority === 'haute' ? 'font-medium' : ''}`}>{i.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[0.64rem] text-mist-500">
          {dayText(i) && <span className="text-mist-300">{dayText(i)}</span>}
          {i.kind !== 'tache' && i.kind !== 'autre' && (
            <span>
              {KIND_ICON[i.kind as TaskKind] ?? ''} {KIND_LABEL[i.kind as TaskKind] ?? i.kind}
            </span>
          )}
          <span className="flex items-center gap-1">
            {i.categories.map((c) => (
              <span key={c} className="flex items-center gap-1" title={CATEGORY_LABEL[c]}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLOR[c] }} />
                {i.categories.length > 1 || c !== 'perso' ? CATEGORY_LABEL[c] : ''}
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  )

  const total = groups.reduce((a, g) => a + g.items.length, 0)

  return (
    <section aria-label="À venir" className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-[0.95rem] font-medium text-mist-100">À venir</h3>
        <span className="text-xs text-mist-500">{total ? `${total} élément${total > 1 ? 's' : ''}` : 'Rien de prévu'}</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="mb-3"
      >
        <div className="flex items-center gap-2 rounded-xl bg-ink-900/70 px-3 hairline focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
          <span className="text-lg text-accent" aria-hidden>
            +
          </span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="rdv dentiste jeudi 14h #santé"
            aria-label="Ajouter une tâche ou une échéance"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-mist-100 outline-none placeholder:text-mist-700"
            enterKeyHint="done"
          />
          {text && (
            <button type="submit" className="shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-xs text-accent">
              Ajouter ↵
            </button>
          )}
        </div>
        <button type="button" onClick={() => setOptions((o) => !o)} aria-expanded={options} className="mt-1.5 px-1 text-[0.68rem] text-mist-500 hover:text-mist-300">
          {options ? '▾' : '▸'} Jour, heure, catégories
        </button>
        {options && (
          <div className="mt-1.5 space-y-2 rounded-xl bg-white/3 p-2.5 hairline">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[0.64rem] text-mist-500">
                Jour
                <input type="date" value={pickedDay || preview?.due || ''} onChange={(e) => setPickedDay(e.target.value)} className="mt-0.5 w-full rounded-lg bg-ink-900/70 px-2 py-1.5 text-xs text-mist-100 hairline outline-none" />
              </label>
              <label className="text-[0.64rem] text-mist-500">
                Heure
                <input type="time" value={pickedTime || preview?.dueTime || ''} onChange={(e) => setPickedTime(e.target.value)} className="mt-0.5 w-full rounded-lg bg-ink-900/70 px-2 py-1.5 text-xs text-mist-100 hairline outline-none" />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['Aujourd’hui', data.today],
                ['Demain', addDayKey(data.today, 1)],
                ['Dans 1 semaine', addDayKey(data.today, 7)],
              ].map(([label, day]) => (
                <button key={day} type="button" onClick={() => setPickedDay(day)} className="rounded-full bg-white/6 px-2.5 py-1 text-[0.68rem] text-mist-300">
                  {label}
                </button>
              ))}
            </div>
            <CategoryChips small value={pickedCats.length ? pickedCats : (preview?.categories ?? ['perso'])} onChange={setPickedCats} />
            <KindPicker value={pickedKind ?? preview?.kind ?? 'tache'} onPick={setPickedKind} />
          </div>
        )}
        {preview?.title && (
          <p className="mt-1.5 px-1 text-[0.66rem] text-mist-500">
            Compris : <span className="text-mist-100">{preview.title}</span>
            {(pickedDay || preview.due) && ` · ${dueLabel({ due: pickedDay || preview.due, dueTime: pickedTime || preview.dueTime } as Task, data.today)}`}
          </p>
        )}
      </form>

      {groups.length === 0 ? (
        <p className="py-4 text-center text-xs text-mist-700">Rien à venir. Ajoute un rendez-vous, une tâche, une échéance.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-0.5 px-1 text-[0.62rem] tracking-wider text-mist-500 uppercase">{g.label}</div>
              <ul>
                {g.items.map((i) => (
                  <Row key={i.id} i={i} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-3 border-t border-white/6 pt-2">
          <button onClick={() => setShowPast((s) => !s)} aria-expanded={showPast} className="text-[0.68rem] text-mist-700 hover:text-mist-500">
            {showPast ? '▾' : '▸'} Passées ({past.length})
          </button>
          {showPast && (
            <ul className="mt-1 opacity-70">
              {past.map((i) => (
                <Row key={i.id} i={i} />
              ))}
              <li>
                <button
                  className="mt-1 px-1.5 text-[0.66rem] text-mist-700 underline"
                  onClick={async () => {
                    for (const i of past) {
                      if (i.source === 'task') await deleteTask(i.id)
                      else await saveDeadline({ ...(i.raw as Deadline), done: true })
                    }
                  }}
                >
                  Tout effacer
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {editTask && <TaskEditor task={editTask} onClose={() => setEditTask(null)} />}
      {editDeadline && <DeadlineEditor deadline={editDeadline} onClose={() => setEditDeadline(null)} />}
    </section>
  )
}
