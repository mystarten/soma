import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { Deadline, DeadlineKind, TaskKind } from '../../types'
import {
  CATEGORY_LABEL,
  DEADLINE_KIND_LABEL,
  KIND_LABEL,
  countdownLabel,
  daysLeft,
  dueLabel,
  parseQuickAdd,
  upcomingDeadlines,
} from '../../engine/tasks'
import KindPicker from './KindPicker'
import { deleteDeadline, saveDeadline } from '../../db/repo'
import { uid } from '../../db/db'
import { parseDay } from '../../engine/time'
import { Button, Field, Select, Sheet, TextArea, TextInput, Toggle } from '../ui/primitives'
import { navigate } from '../../lib/router'

const KINDS = Object.entries(DEADLINE_KIND_LABEL).map(([value, label]) => ({ value, label }))

/** Plus c'est proche, plus ça brille — sans jamais tourner au rouge. */
function urgencyColor(days: number): string {
  if (days <= 2) return '#ffb02e'
  if (days <= 7) return '#ffc24b'
  if (days <= 21) return '#35e3ff'
  return '#7c8dab'
}

export default function DeadlinesPanel({ limit = 5, full = false }: { limit?: number; full?: boolean }) {
  const data = useSoma()
  const [editing, setEditing] = useState<Deadline | null>(null)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<TaskKind | null>(null)
  const preview = useMemo(() => (text.trim() ? parseQuickAdd(text, data.today) : null), [text, data.today])
  const kind: TaskKind = picked ?? (preview && preview.kind !== 'tache' ? preview.kind : 'rdv')
  const list = useMemo(
    () => upcomingDeadlines(data.deadlines, data.today, full ? undefined : limit),
    [data.deadlines, data.today, limit, full],
  )
  const past = useMemo(
    () =>
      full
        ? data.deadlines
            .filter((d) => d.done || d.date < data.today)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10)
        : [],
    [data.deadlines, data.today, full],
  )
  const total = upcomingDeadlines(data.deadlines, data.today).length

  /* Même saisie rapide que les tâches : « rdv dentiste jeudi 10h ». Sans date, on demande la date. */
  const quickAdd = async () => {
    const p = preview
    if (!p?.title) return
    setText('')
    setPicked(null)
    const row: Deadline = {
      id: uid('dl'),
      title: p.title,
      date: p.due ?? data.today,
      kind: kind as DeadlineKind,
      category: p.category,
      notes: p.dueTime ? `à ${p.dueTime}` : undefined,
      updatedAt: new Date().toISOString(),
    }
    if (p.due) await saveDeadline(row)
    else setEditing(row)
  }

  const create = () =>
    setEditing({
      id: uid('dl'),
      title: '',
      date: data.today,
      kind: 'rendu',
      updatedAt: new Date().toISOString(),
    })

  return (
    <section aria-label="Échéances" className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[0.95rem] font-medium text-mist-100">Échéances</h3>
          <p className="text-xs text-mist-500">
            {total ? `${total} à venir` : 'Rendus, oraux, concours, deadlines'}
          </p>
        </div>
        <Button className="px-2.5 py-1.5 text-xs" onClick={create}>
          + Ajouter
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void quickAdd()
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
            placeholder="Nouvelle échéance…  ex. concours blanc 24/11"
            aria-label="Ajouter une échéance"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-mist-100 outline-none placeholder:text-mist-700"
            enterKeyHint="done"
          />
          {text && (
            <button type="submit" className="shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-xs text-accent">
              Entrée ↵
            </button>
          )}
        </div>
        <KindPicker
          value={kind}
          onPick={setPicked}
          kinds={['rdv', 'concours', 'appel', 'rendu', 'penser', 'achat']}
        />
        {preview && (
          <p className="mt-2 px-1 text-[0.68rem] text-mist-500">
            Compris : <span className="text-mist-100">{preview.title || '…'}</span> · {KIND_LABEL[kind]} ·{' '}
            {preview.due ? dueLabel({ due: preview.due, dueTime: preview.dueTime } as never, data.today) : 'date à choisir'} ·{' '}
            {CATEGORY_LABEL[preview.category]}
          </p>
        )}
      </form>

      <ul className="space-y-1.5">
        {list.map((d, i) => {
          const n = daysLeft(d, data.today)
          const color = urgencyColor(n)
          return (
            <li key={d.id}>
              <button
                onClick={() => setEditing(d)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/4"
              >
                <span
                  className={`grid shrink-0 place-items-center rounded-lg tnum ${i === 0 ? 'h-12 w-14' : 'h-10 w-12'}`}
                  style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}33`, color }}
                >
                  <span className={i === 0 ? 'text-sm font-semibold' : 'text-xs font-medium'}>
                    {countdownLabel(d, data.today)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-mist-100 ${i === 0 ? 'text-sm font-medium' : 'text-sm'}`}>
                    {d.title}
                  </span>
                  <span className="text-[0.66rem] text-mist-700">
                    {DEADLINE_KIND_LABEL[d.kind]} · {format(parseDay(d.date), 'EEE d MMM', { locale: fr })}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {!list.length && (
          <li className="py-4 text-center text-xs text-mist-700">
            Aucune échéance. Ajoute un rendu, un oral ou un concours.
          </li>
        )}
      </ul>

      {!full && total > limit && (
        <button onClick={() => navigate('taches')} className="mt-2 w-full text-center text-xs text-accent">
          Voir les {total} échéances →
        </button>
      )}

      {full && past.length > 0 && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <div className="mb-1.5 text-[0.62rem] tracking-wider text-mist-500 uppercase">Passées ou faites</div>
          <ul className="space-y-1">
            {past.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => setEditing(d)}
                  className="flex w-full justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-mist-500 hover:bg-white/4"
                >
                  <span className="truncate">{d.title}</span>
                  <span className="shrink-0">{format(parseDay(d.date), 'd MMM', { locale: fr })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && <DeadlineEditor deadline={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

export function DeadlineEditor({ deadline, onClose }: { deadline: Deadline; onClose: () => void }) {
  const [d, setD] = useState<Deadline>(deadline)
  const isNew = !deadline.title
  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Nouvelle échéance' : 'Échéance'}
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            disabled={!d.title.trim() || !d.date}
            onClick={async () => {
              await saveDeadline({ ...d, title: d.title.trim() })
              onClose()
            }}
          >
            Enregistrer
          </Button>
          {!isNew && (
            <Button
              variant="danger"
              onClick={async () => {
                await deleteDeadline(d.id)
                onClose()
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Intitulé">
          <TextInput
            value={d.title}
            onChange={(e) => setD({ ...d, title: e.target.value })}
            placeholder="Oral d’anglais, rendu projet, concours…"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select value={d.kind} onChange={(v) => setD({ ...d, kind: v as DeadlineKind })} options={KINDS} />
          </Field>
        </div>
        <Field label="Notes" optional>
          <TextArea value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: (e.target as HTMLTextAreaElement).value })} />
        </Field>
        {!isNew && (
          <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2.5 hairline">
            <span className="text-xs text-mist-300">Terminée</span>
            <Toggle checked={!!d.done} onChange={(v) => setD({ ...d, done: v })} label="Terminée" />
          </div>
        )}
      </div>
    </Sheet>
  )
}
