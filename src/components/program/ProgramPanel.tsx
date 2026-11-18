import { useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { ProgramSession } from '../../types'
import { missingExercises, parseProgramDocument } from '../../engine/program'
import { readDocx } from '../../lib/docx'
import { saveExercise, saveProgram } from '../../db/repo'
import { Button, Card, useToast } from '../ui/primitives'
import ProgramJsonSheet from './ProgramJsonSheet'
import { addSession } from '../../engine/programEdit'
import ProgramBoard from './ProgramBoard'

/* ──────────────────────────────────────────────────────────────────────────
   Mon programme : on l'importe une fois (fichier Word), puis on choisit
   simplement la séance et la semaine. Chaque séance et chaque semaine sont
   indépendantes : aucun ordre imposé, on peut en combiner plusieurs le même jour.
   ────────────────────────────────────────────────────────────────────────── */

export default function ProgramPanel() {
  const data = useSoma()
  const { program } = data
  if (!program) return <ImportCard />
  return <ProgramBoard program={program} />
}

/* ── Import ──────────────────────────────────────────────────────────── */

function ImportCard() {
  const data = useSoma()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; sessions: ProgramSession[] } | null>(null)
  const [json, setJson] = useState(false)
  const toast = useToast()

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

  /** Un programme vide à remplir soi-même : une première séance, à compléter dans l'éditeur. */
  const createBlank = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const { sessions } = addSession({ sessions: [] }, 'T1', 'Ma première séance')
    await saveProgram({ id: 'program', name: 'Mon programme', sessions, importedAt: now, updatedAt: now })
    setBusy(false)
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
        <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-2xl text-accent">🏋️</div>
          <div>
            <h2 className="text-xl font-semibold text-mist-100">Bienvenue !</h2>
            <p className="mt-1 text-sm text-mist-300">Commence par ton programme. Tu pourras le modifier autant que tu veux, ensuite.</p>
          </div>
          <input
            ref={input}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
            aria-label="Fichier du programme (.docx)"
          />
          <div className="flex w-full max-w-xs flex-col gap-2.5">
            <Button variant="primary" full disabled={busy} className="!py-3.5 text-base" onClick={() => input.current?.click()}>
              {busy ? 'Lecture…' : 'Importer un fichier Word'}
            </Button>
            <Button full disabled={busy} className="!py-3.5 text-base" onClick={() => setJson(true)}>
              Importer un JSON (fait avec une IA)
            </Button>
            <Button full disabled={busy} className="!py-3.5 text-base" onClick={() => void createBlank()}>
              Créer mon programme
            </Button>
          </div>
          <p className="text-xs text-mist-500">Le fichier est lu sur ton appareil. Une séance par tableau, avec les semaines en lignes (S1, S2…).</p>
        </div>
        {error && <p className="mt-2 text-center text-xs text-[#ffb02e]">{error}</p>}
      </Card>

      {toast.node}
      {json && <ProgramJsonSheet onClose={() => setJson(false)} onDone={(m) => toast.show(m)} />}
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

