import { useMemo, useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program, ProgramSession } from '../../types'
import {
  buildFromProgram,
  missingExercises,
  parseProgramDocument,
  programDone,
  programSpan,
  programStats,
  suggestWeek,
  type BuiltWorkout,
  type ProgramPick,
} from '../../engine/program'
import { readDocx } from '../../lib/docx'
import { deleteProgram, saveExercise, saveProgram } from '../../db/repo'
import { uid } from '../../db/db'
import { Button, Card, EmptyState, ProgressBar, useToast } from '../ui/primitives'

/* ──────────────────────────────────────────────────────────────────────────
   Mon programme : on l'importe une fois (fichier Word), puis on choisit
   simplement la séance et la semaine. Chaque séance et chaque semaine sont
   indépendantes : aucun ordre imposé, on peut en combiner plusieurs le même jour.
   ────────────────────────────────────────────────────────────────────────── */

export default function ProgramPanel({ onStart }: { onStart: (w: BuiltWorkout) => void }) {
  const data = useSoma()
  const { program } = data
  if (!program) return <ImportCard />
  return <Chooser program={program} onStart={onStart} />
}

/* ── Import ──────────────────────────────────────────────────────────── */

function ImportCard() {
  const data = useSoma()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; sessions: ProgramSession[] } | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const blocks = await readDocx(file)
      const parsed = parseProgramDocument(blocks, data.today)
      if (!parsed.sessions.length) {
        setError(
          'Je n’ai trouvé aucune séance dans ce fichier. Il faut un tableau par séance, avec les semaines en lignes (S1, S2…).',
        )
        setDraft(null)
      } else setDraft(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture impossible.')
      setDraft(null)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const confirm = async () => {
    if (!draft) return
    setBusy(true)
    const now = new Date().toISOString()
    const have = new Set(data.exercises.map((e) => e.id))
    for (const ex of missingExercises(draft.sessions, have)) await saveExercise({ ...ex, updatedAt: now })
    await saveProgram({ id: 'program', name: draft.name, sessions: draft.sessions, importedAt: now, updatedAt: now })
    setBusy(false)
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <EmptyState
          title="Importe ton programme"
          hint="Choisis ton fichier Word (.docx). Il est lu sur cet appareil, rien n’est envoyé. Ensuite tu choisis juste la séance et la semaine : les séries, les charges et les repos se remplissent tout seuls."
          action={
            <>
              <input
                ref={input}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
                aria-label="Fichier du programme (.docx)"
              />
              <Button variant="primary" className="mt-2" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? 'Lecture…' : 'Choisir mon fichier Word'}
              </Button>
            </>
          }
        />
        {error && <p className="mt-2 text-center text-xs text-[#ffb02e]">{error}</p>}
      </Card>

      {draft && (
        <Card title="J’ai trouvé ça" subtitle={draft.name}>
          <ul className="flex flex-col gap-1.5">
            {draft.sessions.map((s) => (
              <li key={s.code} className="flex items-baseline gap-2 text-sm">
                <span className="w-8 shrink-0 font-semibold text-accent tnum">{s.code}</span>
                <span className="min-w-0 flex-1 truncate text-mist-100">{s.title}</span>
                <span className="shrink-0 text-[0.7rem] text-mist-500">
                  {s.blocks.length} exercices · {s.weeks.length} semaines
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" full disabled={busy} onClick={() => void confirm()}>
              Importer ce programme
            </Button>
            <Button onClick={() => setDraft(null)}>Annuler</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ── Choisir séance et semaine ───────────────────────────────────────── */

function Chooser({ program, onStart }: { program: Program; onStart: (w: BuiltWorkout) => void }) {
  const data = useSoma()
  const toast = useToast()
  const done = useMemo(() => programDone(data.workouts), [data.workouts])
  const stats = useMemo(() => programStats(program, data.workouts, data.today), [program, data.workouts, data.today])
  const span = programSpan(program)
  /* Une case choisie par séance au maximum : séances et semaines sont indépendantes. */
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [detail, setDetail] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggle = (code: string, week: number) =>
    setPicks((p) => {
      const next = { ...p }
      if (next[code] === week) delete next[code]
      else next[code] = week
      return next
    })
  /* Raccourci : sélectionne d'un coup la semaine proposée de la séance. */
  const quick = (s: ProgramSession) => toggle(s.code, picks[s.code] ?? suggestWeek(s, done.get(s.code), data.today))

  const list: ProgramPick[] = Object.entries(picks).map(([code, week]) => ({ code, week }))
  const start = () => {
    const built = buildFromProgram(program, list, () => uid('set'))
    if (built) onStart(built)
    else toast.show('Choisis au moins une séance')
  }
  const dateLabel = (d?: string) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '')

  return (
    <div className="flex flex-col gap-3">
      {toast.node}
      <Card
        title={program.name}
        subtitle={span.start && span.end ? `Du ${dateLabel(span.start)} au ${dateLabel(span.end)}` : undefined}
      >
        <div className="flex items-baseline justify-between text-xs text-mist-500">
          <span>
            {stats.done} / {stats.total} séances faites
          </span>
          {stats.thisWeekTotal > 0 && (
            <span>
              cette semaine : {stats.thisWeekDone} / {stats.thisWeekTotal}
            </span>
          )}
        </div>
        <div className="mt-1.5">
          <ProgressBar ratio={stats.total ? stats.done / stats.total : 0} />
        </div>
      </Card>

      <Card
        title="Qu’est-ce que tu fais aujourd’hui ?"
        subtitle="Touche une case (séance × semaine). Tu peux en prendre plusieurs : une séance de tirage + abdos + jambes, par exemple."
        padded={false}
      >
        <ul className="divide-y divide-white/6">
          {program.sessions.map((s) => {
            const sel = picks[s.code]
            const d = done.get(s.code)
            const isOpen = detail === s.code
            return (
              <li key={s.code} className="px-3 py-3 sm:px-4">
                <div className="flex items-baseline gap-2">
                  <button
                    onClick={() => quick(s)}
                    aria-label={`Choisir ${s.code}`}
                    className={`w-9 shrink-0 rounded-md px-1 py-0.5 text-center text-sm font-semibold tnum transition ${
                      sel ? 'bg-accent text-ink-950' : 'bg-white/6 text-accent'
                    }`}
                  >
                    {s.code}
                  </button>
                  <button onClick={() => setDetail(isOpen ? null : s.code)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm text-mist-100">{s.title}</span>
                    <span className="block truncate text-[0.68rem] text-mist-500">{s.meta}</span>
                  </button>
                  <span className="shrink-0 text-[0.68rem] text-mist-500 tnum">
                    {d?.size ?? 0}/{s.weeks.length}
                  </span>
                </div>
                <div className="scroll-x mt-2 flex gap-1" role="group" aria-label={`Semaines de ${s.code}`}>
                  {s.weeks.map((w) => {
                    const isDone = d?.has(w.n)
                    const active = sel === w.n
                    const current = !!(w.startDay && w.endDay && w.startDay <= data.today && data.today <= w.endDay)
                    return (
                      <button
                        key={w.n}
                        onClick={() => toggle(s.code, w.n)}
                        aria-pressed={active}
                        title={`${w.label}${w.light ? ' · légère' : ''}${w.test ? ' · test' : ''}`}
                        className="relative grid h-9 min-w-9 shrink-0 place-items-center rounded-lg text-xs tnum transition active:scale-95"
                        style={{
                          background: active
                            ? 'var(--accent)'
                            : w.test
                              ? '#2e75b633'
                              : w.light
                                ? '#ffc24b22'
                                : '#ffffff0d',
                          color: active ? '#04070d' : isDone ? 'var(--accent)' : '#b9c6dc',
                          boxShadow: current && !active ? 'inset 0 0 0 1.5px var(--accent)' : undefined,
                          fontWeight: active || isDone ? 600 : 400,
                        }}
                      >
                        {isDone && !active ? '✓' : w.n}
                      </button>
                    )
                  })}
                </div>
                {sel !== undefined && (
                  <p className="mt-1.5 text-[0.68rem] text-mist-300">
                    Semaine {sel} · {s.weeks.find((w) => w.n === sel)?.label}
                    {s.weeks.find((w) => w.n === sel)?.light ? ' · légère' : ''}
                    {s.weeks.find((w) => w.n === sel)?.test ? ' · test' : ''}
                  </p>
                )}
                {isOpen && <SessionPreview session={s} week={sel ?? suggestWeek(s, d, data.today)} />}
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="sticky bottom-[calc(var(--nav-h)+var(--safe-bottom)+0.5rem)] z-20 flex gap-2 lg:bottom-3">
        <Button variant="primary" full disabled={!list.length} onClick={start}>
          {list.length
            ? `Préparer : ${list.map((p) => `${p.code} · S${p.week}`).join(' + ')}`
            : 'Choisis une séance et une semaine'}
        </Button>
      </div>

      <div className="flex justify-center pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs text-mist-300">
            Remplacer le programme ?
            <Button variant="danger" onClick={() => void deleteProgram().then(() => setConfirmDelete(false))}>
              Oui, l’effacer
            </Button>
            <Button onClick={() => setConfirmDelete(false)}>Non</Button>
          </div>
        ) : (
          <button className="text-xs text-mist-500 underline" onClick={() => setConfirmDelete(true)}>
            Remplacer mon programme
          </button>
        )}
      </div>
    </div>
  )
}

function SessionPreview({ session, week }: { session: ProgramSession; week: number }) {
  const wi = session.weeks.findIndex((w) => w.n === week)
  if (wi < 0) return null
  return (
    <div className="mt-2 rounded-xl bg-white/4 p-2.5 text-xs hairline">
      <div className="mb-1 text-mist-500">
        Prévu · semaine {week} ({session.weeks[wi].label})
      </div>
      <ul className="flex flex-col gap-1">
        {session.blocks.map((b) => (
          <li key={b.name} className="flex gap-2">
            <span className="w-1/2 min-w-0 truncate text-mist-300">{b.name}</span>
            <span className="min-w-0 flex-1 text-mist-100">{b.cells[wi] || '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
