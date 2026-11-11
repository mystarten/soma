import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import type { WeeklyReview } from '../types'
import { addDayKey, parseDay } from '../engine/time'
import { insights, questionFor, reviewDone, reviewWeekFor, weekStats } from '../engine/review'
import { saveReview } from '../db/repo'
import { Button, Card, Field, Segmented, TextArea } from '../components/ui/primitives'

/* ──────────────────────────────────────────────────────────────────────────
   Revue de la semaine : les chiffres, ce qui a changé, une question,
   trois lignes à écrire. Une fois par semaine, deux minutes.
   ────────────────────────────────────────────────────────────────────────── */

const label = (start: string, end: string) =>
  `${format(parseDay(start), 'd MMM', { locale: fr })} → ${format(parseDay(end), 'd MMM', { locale: fr })}`

export default function Review() {
  const data = useSoma()
  const target = reviewWeekFor(data.today, data.settings.weekStartsOn)
  const [start, setStart] = useState(target.start)
  const end = addDayKey(start, 6)
  const src = useMemo(
    () => ({ workouts: data.workouts, checkins: data.checkins, tasks: data.tasks }),
    [data.workouts, data.checkins, data.tasks],
  )
  const cur = useMemo(() => weekStats(start, src), [start, src])
  const prev = useMemo(() => weekStats(addDayKey(start, -7), src), [start, src])
  const lines = useMemo(() => insights(cur, prev, data.settings.sleepGoalHours), [cur, prev, data.settings.sleepGoalHours])
  const question = useMemo(
    () => questionFor(start, cur, prev, data.settings.sleepGoalHours),
    [start, cur, prev, data.settings.sleepGoalHours],
  )

  const saved = data.reviews.find((r) => r.id === start)
  const [form, setForm] = useState<Partial<WeeklyReview>>({})
  const loadedFor = useRef<string | null>(null)
  /* On charge la revue de la semaine affichée une seule fois : ce que tu tapes n'est jamais écrasé. */
  useEffect(() => {
    if (loadedFor.current === start) return
    loadedFor.current = start
    setForm(saved ?? {})
  }, [start, saved])

  const [status, setStatus] = useState<'' | 'ok'>('')
  const patch = (p: Partial<WeeklyReview>) => {
    setStatus('')
    setForm((f) => ({ ...f, ...p }))
  }
  const save = async () => {
    const now = new Date().toISOString()
    await saveReview({
      id: start,
      weekStart: start,
      createdAt: saved?.createdAt ?? now,
      updatedAt: now,
      ...form,
      question,
    })
    setStatus('ok')
  }

  const history = [...data.reviews].filter(reviewDone).sort((a, b) => b.weekStart.localeCompare(a.weekStart))
  const stepWeek = (n: number) => setStart(addDayKey(start, 7 * n))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <Card
        title={target.current && start === target.start ? 'Ta semaine' : 'Revue de la semaine'}
        subtitle={label(start, end)}
        action={
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => stepWeek(-1)} aria-label="Semaine précédente">
              ‹
            </Button>
            <Button variant="ghost" onClick={() => stepWeek(1)} disabled={start >= target.start} aria-label="Semaine suivante">
              ›
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-1.5 text-sm text-mist-100">
          {lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="text-accent" aria-hidden>
                ·
              </span>
              {l}
            </li>
          ))}
        </ul>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat value={cur.sessions} unit="séances" />
          <Stat value={cur.avgSleepH !== null ? cur.avgSleepH.toFixed(1) : '—'} unit="h de sommeil" />
          <Stat value={cur.avgRecovery !== null ? Math.round(cur.avgRecovery) : '—'} unit="% récup." />
        </div>
      </Card>

      <Card title="Ta question de la semaine">
        <p className="mb-2 text-sm text-mist-100">{question}</p>
        <TextArea
          value={form.answer ?? ''}
          onChange={(e) => patch({ answer: (e.target as HTMLTextAreaElement).value })}
          placeholder="Une ou deux phrases suffisent."
          aria-label="Ta réponse"
        />
      </Card>

      <Card title="Trois lignes">
        <div className="flex flex-col gap-3">
          <Field label="Ce qui a bien marché">
            <TextArea rows={2} value={form.wentWell ?? ''} onChange={(e) => patch({ wentWell: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="Ce qui a pesé">
            <TextArea rows={2} value={form.heavy ?? ''} onChange={(e) => patch({ heavy: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="Une seule chose pour la semaine prochaine">
            <TextArea rows={2} value={form.nextFocus ?? ''} onChange={(e) => patch({ nextFocus: (e.target as HTMLTextAreaElement).value })} />
          </Field>
          <Field label="Comment s’est passée cette semaine ?" group>
            <Segmented
              value={String(form.rating ?? '')}
              onChange={(v) => patch({ rating: Number(v) as WeeklyReview['rating'] })}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: ['😵', '🙁', '😐', '🙂', '🔥'][n - 1] }))}
            />
          </Field>
        </div>
        <Button variant="primary" full className="mt-4" onClick={() => void save()}>
          {status === 'ok' ? 'Enregistré ✓' : saved ? 'Mettre à jour' : 'Enregistrer ma revue'}
        </Button>
      </Card>

      {history.length > 0 && (
        <Card title="Revues passées">
          <ul className="flex flex-col divide-y divide-white/6">
            {history.map((r) => (
              <li key={r.id} className="py-2.5">
                <button onClick={() => setStart(r.weekStart)} className="w-full text-left">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-mist-500">
                    <span>{label(r.weekStart, addDayKey(r.weekStart, 6))}</span>
                    <span>{r.rating ? ['😵', '🙁', '😐', '🙂', '🔥'][r.rating - 1] : ''}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-mist-100">{r.nextFocus || r.wentWell || r.answer || r.heavy}</p>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Stat({ value, unit }: { value: string | number; unit: string }) {
  return (
    <div className="rounded-xl bg-white/5 py-2 hairline">
      <div className="text-lg font-semibold text-mist-100 tnum">{value}</div>
      <div className="text-[0.65rem] text-mist-500">{unit}</div>
    </div>
  )
}
