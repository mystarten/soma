import { useMemo, useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { missingExercises, parseProgramDocument, plannedWeeks } from '../../engine/program'
import { explainJsonSyntaxError, programFromJson, PROGRAM_FORMAT_DOC } from '../../engine/programJson'
import { programStartDay } from '../../engine/todayPlan'
import { readDocx } from '../../lib/docx'
import { saveExercise, saveProgram, saveSettings } from '../../db/repo'
import { backupNow } from '../../db/backup'
import { copyText } from '../../lib/clipboard'
import type { ProgramSession } from '../../types'
import { Button, Sheet } from '../ui/primitives'

interface Candidate {
  name: string
  sessions: ProgramSession[]
  warnings: string[]
  source: string
}

/** Python/JSON collé ou fichier (.json, .txt, .docx) → un programme candidat, ou des erreurs précises. */
async function readCandidate(text: string, file: File | null, today: string): Promise<{ cand?: Candidate; errors: string[] }> {
  try {
    if (file && /\.docx$/i.test(file.name)) {
      const parsed = parseProgramDocument(await readDocx(file), today)
      if (!parsed.sessions.length) return { errors: [`Fichier Word « ${file.name} » : aucune séance trouvée. Il faut un tableau par séance, avec les semaines en lignes (S1, S2…) et un titre du type « T1 Tirage lesté ».`] }
      return { cand: { name: parsed.name || file.name.replace(/\.docx$/i, ''), sessions: parsed.sessions, warnings: [], source: `fichier Word « ${file.name} »` }, errors: [] }
    }
    const raw = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
    if (!raw) return { errors: ['Rien à importer : colle un JSON ou choisis un fichier.'] }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (e) {
      return { errors: [explainJsonSyntaxError(raw, e)] }
    }
    const r = programFromJson(json)
    if (!r.program) return { errors: r.errors }
    return { cand: { name: r.program.name, sessions: r.program.sessions, warnings: r.warnings, source: file ? `fichier « ${file.name} »` : 'texte collé' }, errors: [] }
  } catch (e) {
    return { errors: [`Lecture impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}.`] }
  }
}

/**
 * Importer (ou remplacer) le programme : fichier Word, fichier JSON ou texte collé.
 * Toujours un aperçu, puis une confirmation qui dit ce qui est conservé et ce qui est supprimé.
 */
export default function ProgramImportSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const data = useSoma()
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [cand, setCand] = useState<Candidate | null>(null)
  const [stage, setStage] = useState<'input' | 'confirm'>('input')
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const old = data.program
  const kept = data.workouts.length
  const hasDates = useMemo(() => !!cand && !!programStartDay({ sessions: cand.sessions }), [cand])
  const lastWeek = cand ? Math.max(...cand.sessions.map((s) => s.weeks.length), 0) : 0

  const analyse = async (t: string, f: File | null) => {
    setStage('input')
    if (!t.trim() && !f) {
      setErrors([])
      setCand(null)
      return
    }
    const r = await readCandidate(t, f, data.today)
    setErrors(r.errors)
    setCand(r.cand ?? null)
  }

  const doImport = async () => {
    if (!cand) return
    setBusy(true)
    try {
      /* Copie de sécurité juste avant de remplacer, puis remplacement complet (aucune fusion). */
      if (old) await backupNow('avant remplacement du programme')
      const now = new Date().toISOString()
      const have = new Set(data.exercises.map((e) => e.id))
      for (const ex of missingExercises(cand.sessions, have)) await saveExercise({ ...ex, updatedAt: now })
      await saveProgram({ id: 'program', name: cand.name, sessions: cand.sessions, importedAt: now, updatedAt: now })
      await saveSettings({ programStart: !hasDates && start ? start : undefined })
      onDone(`Programme « ${cand.name} » importé (${cand.sessions.length} séances)`)
      onClose()
    } catch (e) {
      setErrors([`L’enregistrement a échoué : ${e instanceof Error ? e.message : 'erreur inconnue'}. Rien n’a été modifié.`])
      setBusy(false)
    }
  }

  const needsStart = !!cand && !hasDates
  const canContinue = !!cand && (!needsStart || !!start)

  return (
    <Sheet
      open
      onClose={onClose}
      title={old ? 'Remplacer mon programme' : 'Importer mon programme'}
      wide
      footer={
        stage === 'confirm' ? (
          <div className="flex gap-2">
            <Button variant="primary" full disabled={busy} onClick={() => void doImport()}>{busy ? 'Remplacement…' : 'Oui, remplacer'}</Button>
            <Button onClick={() => setStage('input')}>Retour</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" full disabled={!canContinue || busy} onClick={() => (old ? setStage('confirm') : void doImport())}>
              {old ? 'Continuer' : 'Importer ce programme'}
            </Button>
            <Button onClick={onClose}>Annuler</Button>
          </div>
        )
      }
    >
      {stage === 'confirm' && cand ? (
        <div className="space-y-3 pb-2">
          <p className="text-base font-medium text-mist-100">Remplacer « {old?.name} » par « {cand.name} » ?</p>
          <div className="rounded-xl bg-[#41e08a]/10 p-3.5 text-sm text-mist-100">
            <p className="font-medium text-[#41e08a]">✓ Conservé</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-mist-300">
              <li>ton journal : {kept} séance{kept > 1 ? 's' : ''} enregistrée{kept > 1 ? 's' : ''} (séries, notes, effort)</li>
              <li>ton calendrier, tes séances libres et ton avancement déjà fait</li>
              <li>ton compte et la synchronisation</li>
            </ul>
          </div>
          <div className="rounded-xl bg-[#ff5a5a]/10 p-3.5 text-sm text-mist-100">
            <p className="font-medium text-[#ff8f8f]">✗ Supprimé</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-mist-300">
              <li>l’ancien programme « {old?.name} » : {old?.sessions.length} séances, {old?.sessions.reduce((a, s) => a + s.blocks.length, 0)} exercices et toutes ses semaines</li>
              <li>aucune fusion : seul le nouveau programme existera, sans doublon</li>
            </ul>
          </div>
          <p className="text-xs text-mist-500">Une sauvegarde automatique est faite juste avant. Tu pourras la télécharger dans Réglages → Stockage et santé.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-mist-300">
            <li>
              <button className="text-accent underline" onClick={async () => setCopied(await copyText(PROGRAM_FORMAT_DOC))}>
                Copie les consignes pour l’IA
              </button>{' '}
              {copied && <span className="text-xs text-[#41e08a]">✓ copié</span>} et colle-les dans Claude avec ton programme.
            </li>
            <li>Colle le JSON ci-dessous, ou choisis un fichier (.json, .txt ou Word .docx).</li>
          </ol>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setFile(null)
              void analyse(e.target.value, null)
            }}
            rows={8}
            placeholder='{ "format": "soma-programme", ... }'
            className="w-full resize-y rounded-xl bg-ink-900/70 px-3.5 py-3 font-mono text-xs text-mist-100 hairline outline-none"
            spellCheck={false}
          />
          <input
            ref={input}
            type="file"
            accept=".json,.txt,.docx,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setFile(f)
              const t = /\.docx$/i.test(f.name) ? '' : await f.text()
              setText(t)
              await analyse(t, f)
              if (input.current) input.current.value = ''
            }}
          />
          <Button onClick={() => input.current?.click()}>{file ? `Fichier : ${file.name}` : 'Choisir un fichier'}</Button>

          {errors.length > 0 && (
            <div role="alert" className="rounded-xl bg-[#ff5a5a]/10 p-3 text-xs text-[#ff9a9a]">
              <p className="mb-1 font-medium">Ce programme ne peut pas être importé :</p>
              <ul className="space-y-1">
                {errors.slice(0, 15).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
                {errors.length > 15 && <li>… et {errors.length - 15} autres erreurs</li>}
              </ul>
            </div>
          )}

          {cand && (
            <div className="rounded-xl bg-white/5 p-3.5 hairline">
              <p className="text-xs text-mist-500">Aperçu · {cand.source}</p>
              <p className="mt-0.5 text-base font-semibold text-mist-100">{cand.name}</p>
              <p className="text-sm text-mist-300">
                {cand.sessions.length} séances · {lastWeek} semaines
              </p>
              <ul className="mt-2 divide-y divide-white/6">
                {cand.sessions.map((s) => (
                  <li key={s.code} className="flex items-baseline gap-2 py-1.5 text-sm">
                    <span className="w-8 shrink-0 font-semibold text-accent tnum">{s.code}</span>
                    <span className="min-w-0 flex-1 text-mist-100">{s.title}</span>
                    <span className="shrink-0 text-[0.7rem] text-mist-500">{s.blocks.length} exos · {plannedWeeks(s).length} sem.</span>
                  </li>
                ))}
              </ul>
              {needsStart && (
                <label className="mt-3 block text-xs text-mist-300">
                  Ce programme n’a pas de dates. Lundi de la semaine 1 :
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block min-h-12 w-full rounded-xl bg-ink-900/70 px-3.5 text-base text-mist-100 hairline outline-none" />
                </label>
              )}
              {cand.warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[0.7rem] text-mist-500">
                  {cand.warnings.slice(0, 6).map((w, i) => (
                    <li key={i}>⚠ {w}</li>
                  ))}
                </ul>
              )}
              {old && <p className="mt-2 text-xs text-[#ffc24b]">Il remplacera ton programme actuel. L’écran suivant détaille ce qui est conservé et supprimé.</p>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
