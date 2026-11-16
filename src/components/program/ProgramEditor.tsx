import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { missingExercises } from '../../engine/program'
import {
  addBlock, addSession, addWeek, applyCellToAll, describeCell, moveBlock, removeBlock, removeSession,
  setCell, toggleWeekFlag, updateBlock, updateSession,
} from '../../engine/programEdit'
import { saveExercise, saveProgram } from '../../db/repo'
import { Button, Field, Select, Sheet, Stepper, TextInput } from '../ui/primitives'

type Draft = Pick<Program, 'sessions'>

/** Modifier le programme directement : séances, exercices, séries par semaine, repos, décharges et tests. */
export default function ProgramEditor({ program, onClose, onSaved }: { program: Program; onClose: () => void; onSaved: () => void }) {
  const data = useSoma()
  const [draft, setDraft] = useState<Draft>({ sessions: structuredClone(program.sessions) })
  const [code, setCode] = useState(program.sessions[0]?.code ?? '')
  const [wi, setWi] = useState(0)
  const [busy, setBusy] = useState(false)
  const [newCode, setNewCode] = useState('')
  const session = draft.sessions.find((s) => s.code === code) ?? draft.sessions[0]
  const apply = (fn: (d: Draft) => Draft) => setDraft((d) => fn(d))
  const week = session?.weeks[wi]

  const hints = useMemo(() => 'Écris par exemple : 4 x 8 +20 kg · 3 x 40 s · 60 - 55 - 50 · repos 2:00 · test · repos', [])

  const save = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const have = new Set(data.exercises.map((e) => e.id))
    for (const ex of missingExercises(draft.sessions, have)) await saveExercise({ ...ex, updatedAt: now })
    await saveProgram({ ...program, sessions: draft.sessions, updatedAt: now })
    setBusy(false)
    onSaved()
    onClose()
  }

  if (!session) return null
  return (
    <Sheet
      open
      onClose={onClose}
      title="Modifier mon programme"
      wide
      footer={
        <div className="flex gap-2">
          <Button variant="primary" full disabled={busy} onClick={() => void save()}>Enregistrer le programme</Button>
          <Button onClick={onClose}>Annuler</Button>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Séance">
            <Select
              value={session.code}
              onChange={(v) => { setCode(v); setWi(0) }}
              options={draft.sessions.map((s) => ({ value: s.code, label: `${s.code} · ${s.title}` }))}
            />
          </Field>
          <div className="flex items-end gap-2">
            <TextInput className="w-20" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Code" aria-label="Code de la nouvelle séance" />
            <Button
              disabled={!newCode.trim() || draft.sessions.some((s) => s.code === newCode.trim().toUpperCase())}
              onClick={() => { apply((d) => addSession(d, newCode, 'Nouvelle séance')); setCode(newCode.trim().toUpperCase()); setNewCode(''); setWi(0) }}
            >
              + Séance
            </Button>
          </div>
        </div>
        <p className="-mt-2 text-[0.68rem] text-mist-500">Le code donne la famille : T, M ou P = street workout · J = jambes · A = abdos.</p>

        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Field label="Nom de la séance">
            <TextInput value={session.title} onChange={(e) => apply((d) => updateSession(d, session.code, { title: e.target.value }))} />
          </Field>
          <Field label="Durée">
            <Stepper value={session.durationMin ?? 45} onChange={(v) => apply((d) => updateSession(d, session.code, { durationMin: v }))} min={5} max={240} step={5} suffix="min" />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-mist-300">Semaine modifiée</span>
            <button className="text-xs text-accent" onClick={() => { apply((d) => addWeek(d)); setWi(session.weeks.length) }}>+ Ajouter une semaine</button>
          </div>
          <div className="scroll-x flex gap-1.5">
            {session.weeks.map((w, i) => (
              <button
                key={w.n}
                onClick={() => setWi(i)}
                className="grid h-9 min-w-10 shrink-0 place-items-center rounded-lg px-2 text-sm tnum transition"
                style={{
                  background: i === wi ? 'var(--accent)' : '#ffffff0f',
                  color: i === wi ? '#04070d' : w.test ? '#6fa8ff' : w.light ? '#d6b25b' : '#b9c6dc',
                }}
              >
                S{w.n}
              </button>
            ))}
          </div>
          {week && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button onClick={() => apply((d) => toggleWeekFlag(d, session.code, wi, 'light'))} className="rounded-lg px-2.5 py-1.5 hairline" style={{ background: week.light ? '#d6b25b33' : '#ffffff0a', color: week.light ? '#d6b25b' : '#b9c6dc' }}>
                {week.light ? '✓ Semaine de décharge' : 'Marquer comme décharge'}
              </button>
              <button onClick={() => apply((d) => toggleWeekFlag(d, session.code, wi, 'test'))} className="rounded-lg px-2.5 py-1.5 hairline" style={{ background: week.test ? '#6fa8ff33' : '#ffffff0a', color: week.test ? '#6fa8ff' : '#b9c6dc' }}>
                {week.test ? '✓ Semaine de test' : 'Marquer comme test'}
              </button>
            </div>
          )}
        </div>

        <ul className="space-y-3">
          {session.blocks.map((b, bi) => (
            <li key={bi} className="rounded-xl bg-white/4 p-3 hairline">
              <div className="flex items-center gap-2">
                <TextInput value={b.name} onChange={(e) => apply((d) => updateBlock(d, session.code, bi, { name: e.target.value }))} aria-label="Nom de l’exercice" />
                <button aria-label="Monter" disabled={bi === 0} onClick={() => apply((d) => moveBlock(d, session.code, bi, -1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/6 text-mist-300 disabled:opacity-30">↑</button>
                <button aria-label="Descendre" disabled={bi === session.blocks.length - 1} onClick={() => apply((d) => moveBlock(d, session.code, bi, 1))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/6 text-mist-300 disabled:opacity-30">↓</button>
                <button aria-label="Supprimer l’exercice" onClick={() => apply((d) => removeBlock(d, session.code, bi))} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ff5a5a]/15 text-[#ff8f8f]">✕</button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem]">
                <div>
                  <TextInput value={b.cells[wi] ?? ''} onChange={(e) => apply((d) => setCell(d, session.code, bi, wi, e.target.value))} placeholder="Ex. 4 x 8 +20 kg" aria-label={`Séries de la semaine ${week?.n}`} />
                  <p className="mt-1 text-[0.68rem] text-mist-500">{describeCell(b.cells[wi] ?? '') || `Semaine ${week?.n} : à renseigner`}</p>
                </div>
                <Stepper value={b.restSec ?? 90} onChange={(v) => apply((d) => updateBlock(d, session.code, bi, { restSec: v }))} min={0} max={600} step={15} suffix="s repos" />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3 text-[0.7rem]">
                <button className="text-accent" onClick={() => apply((d) => applyCellToAll(d, session.code, bi, wi))}>Appliquer à toutes les semaines</button>
                {wi > 0 && <button className="text-accent" onClick={() => apply((d) => setCell(d, session.code, bi, wi, b.cells[wi - 1] ?? ''))}>Reprendre la semaine précédente</button>}
              </div>
            </li>
          ))}
        </ul>
        <Button onClick={() => apply((d) => addBlock(d, session.code))}>+ Ajouter un exercice</Button>
        <p className="text-[0.68rem] text-mist-500">{hints}</p>

        <div className="border-t border-white/6 pt-3">
          <button
            className="text-xs text-[#ff8f8f]"
            onClick={() => {
              if (!window.confirm(`Supprimer la séance ${session.code} ? Les semaines déjà cochées restent dans ton historique.`)) return
              apply((d) => removeSession(d, session.code))
              setCode(draft.sessions.find((s) => s.code !== session.code)?.code ?? '')
              setWi(0)
            }}
          >
            Supprimer cette séance
          </button>
        </div>
      </div>
    </Sheet>
  )
}
