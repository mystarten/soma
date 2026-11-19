import { useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { saveProgram } from '../../db/repo'
import { Button, Card, useToast } from '../ui/primitives'
import ProgramImportSheet from './ProgramImportSheet'
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
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  /** Un programme vide à remplir soi-même : une première séance, à compléter dans l'éditeur. */
  const createBlank = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const { sessions } = addSession({ sessions: [] }, 'T1', 'Ma première séance')
    await saveProgram({ id: 'program', name: 'Mon programme', sessions, importedAt: now, updatedAt: now })
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {toast.node}
      {importing && <ProgramImportSheet onClose={() => setImporting(false)} onDone={(m) => toast.show(m)} />}
      <Card>
        <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-2xl text-accent">🏋️</div>
          <div>
            <h2 className="text-xl font-semibold text-mist-100">Bienvenue !</h2>
            <p className="mt-1 text-sm text-mist-300">Commence par ton programme. Tu pourras le modifier autant que tu veux, ensuite.</p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2.5">
            <Button variant="primary" full disabled={busy} className="!py-3.5 text-base" onClick={() => setImporting(true)}>
              Importer un programme
            </Button>
            <Button full disabled={busy} className="!py-3.5 text-base" onClick={() => void createBlank()}>
              Créer mon programme
            </Button>
          </div>
          <p className="text-xs text-mist-500">Fichier Word, fichier JSON ou JSON collé (fait avec une IA). Tu verras un aperçu avant que rien ne soit enregistré.</p>
        </div>
      </Card>
    </div>
  )
}
