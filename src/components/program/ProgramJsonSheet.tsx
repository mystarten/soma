import { useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { missingExercises } from '../../engine/program'
import { programFromJson, PROGRAM_FORMAT_DOC, type JsonResult } from '../../engine/programJson'
import { saveExercise, saveProgram } from '../../db/repo'
import { copyText } from '../../lib/clipboard'
import { Button, Sheet } from '../ui/primitives'

/** Importer un programme au format JSON (écrit par une IA ou exporté depuis l'appli) : collé ou en fichier. */
export default function ProgramJsonSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const data = useSoma()
  const [text, setText] = useState('')
  const [res, setRes] = useState<JsonResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const check = (t: string) => {
    try {
      setRes(programFromJson(JSON.parse(t.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim())))
    } catch (e) {
      setRes({ errors: [`Ce n’est pas du JSON valide (${e instanceof Error ? e.message : 'erreur'}). Colle uniquement le bloc JSON donné par l’IA.`], warnings: [] })
    }
  }

  const doImport = async () => {
    if (!res?.program) return
    setBusy(true)
    const now = new Date().toISOString()
    const have = new Set(data.exercises.map((e) => e.id))
    for (const ex of missingExercises(res.program.sessions, have)) await saveExercise({ ...ex, updatedAt: now })
    await saveProgram({ id: 'program', name: res.program.name, sessions: res.program.sessions, importedAt: now, updatedAt: now })
    setBusy(false)
    onDone(`Programme « ${res.program.name} » importé (${res.program.sessions.length} séances)`)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Importer un programme (JSON)"
      wide
      footer={
        <div className="flex gap-2">
          <Button variant="primary" full disabled={busy || !res?.program} onClick={() => void doImport()}>
            {data.program ? 'Remplacer mon programme' : 'Importer ce programme'}
          </Button>
          <Button onClick={onClose}>Annuler</Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-mist-300">
          <li>
            <button
              className="text-accent underline"
              onClick={async () => {
                setCopied(await copyText(PROGRAM_FORMAT_DOC))
              }}
            >
              Copie les consignes pour l’IA
            </button>{' '}
            {copied && <span className="text-xs text-[#41e08a]">✓ copié</span>} et colle-les dans Claude avec ton programme.
          </li>
          <li>Colle ici le JSON qu’elle te renvoie (ou choisis un fichier).</li>
        </ol>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.trim()) check(e.target.value)
            else setRes(null)
          }}
          rows={9}
          placeholder='{ "format": "soma-programme", ... }'
          className="w-full resize-y rounded-xl bg-ink-900/70 px-3.5 py-3 font-mono text-xs text-mist-100 hairline outline-none"
          spellCheck={false}
        />
        <input
          ref={file}
          type="file"
          accept="application/json,.json,.txt"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const t = await f.text()
            setText(t)
            check(t)
            if (file.current) file.current.value = ''
          }}
        />
        <Button onClick={() => file.current?.click()}>Choisir un fichier .json</Button>

        {res && res.errors.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-[#ff5a5a]/10 p-3 text-xs text-[#ff9a9a]" role="alert">
            {res.errors.slice(0, 12).map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
            {res.errors.length > 12 && <li>… et {res.errors.length - 12} autres erreurs</li>}
          </ul>
        )}
        {res?.program && (
          <div className="rounded-xl bg-[#41e08a]/10 p-3 text-sm text-mist-100">
            ✓ Programme valide : <b>{res.program.name}</b> · {res.program.sessions.length} séances · {res.program.sessions[0]?.weeks.length} semaines
            <ul className="mt-1 text-xs text-mist-300">
              {res.program.sessions.map((s) => (
                <li key={s.code}>
                  {s.code} — {s.title} ({s.blocks.length} exercices)
                </li>
              ))}
            </ul>
            {data.program && <p className="mt-2 text-xs text-[#ffc24b]">Il remplacera ton programme actuel. Les semaines déjà cochées (par code de séance) sont conservées.</p>}
          </div>
        )}
        {res && res.warnings.length > 0 && (
          <ul className="space-y-0.5 text-[0.7rem] text-mist-500">
            {res.warnings.slice(0, 6).map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  )
}
