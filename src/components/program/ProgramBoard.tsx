import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { programSpan, programStats } from '../../engine/program'
import { pickSuggestion, simpleAdvice, trainingStreak } from '../../engine/simpleAdvice'
import { SOCLE_LABEL, SOCLE_ORDER, socleOf, type RotationItem } from '../../engine/rotation'
import { deleteProgram, saveSettings } from '../../db/repo'
import { Button, Card, ProgressBar, Segmented, Sheet, Stepper, useToast } from '../ui/primitives'
import SessionPreview from './SessionPreview'
import TickSheet from './TickSheet'
import { WeekNote } from './weekNote'
import { useRotation } from './useRotation'
import ProgramTable from './ProgramTable'
import ProgramEditor from './ProgramEditor'
import SessionRunner from './SessionRunner'
import { saveProgress, undoDone } from './programActions'
import { fmtDuration, sessionTiming } from '../../engine/runPlan'

/* ──────────────────────────────────────────────────────────────────────────
   Programme, en trois socles (street workout, jambes, abdos). Dans chaque socle, seules les séances
   dont c'est le tour sont proposées ; les autres attendent, grisées. Une séance cochée disparaît du
   haut de la liste et se range dans l'historique, où l'on peut retirer la coche en cas d'erreur.
   ────────────────────────────────────────────────────────────────────────── */

const SETUP_KEY = 'soma-program-setup-dismissed'
const readDismissed = () => {
  try {
    return window.localStorage.getItem(SETUP_KEY) === '1'
  } catch {
    return false
  }
}

export default function ProgramBoard({ program }: { program: Program }) {
  const data = useSoma()
  const toast = useToast()
  const { rotation, all, done } = useRotation()
  const stats = useMemo(() => programStats(program, all, data.today), [program, all, data.today])
  const span = programSpan(program)
  const [tick, setTick] = useState<{ code: string; week: number } | null>(null)
  const [undo, setUndo] = useState<{ code: string; week: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const dateLabel = (d?: string) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '')
  const [adjust, setAdjust] = useState(false)
  const [editing, setEditing] = useState(false)
  const [run, setRun] = useState<{ code: string; week: number } | null>(null)
  const nothingDone = stats.done === 0 && !dismissed
  const light = false
  const streak = useMemo(() => trainingStreak(data.workouts, data.today), [data.workouts, data.today])
  const restEvery = data.settings.restEvery === 2 ? 2 : 3
  const advice = simpleAdvice({ streak: streak.days, todayDone: streak.todayDone, restEvery })
  const suggestion = useMemo(() => pickSuggestion(rotation), [rotation])
  const others = rotation.flatMap((r) => r.available).filter((i) => i.code !== suggestion?.code)

  return (
    <div className="flex flex-col gap-3">
      {toast.node}
      <section className="rounded-[var(--radius-card)] p-4 hairline" style={{ background: advice.rest ? 'linear-gradient(135deg,#2a1d0e,#0a101c)' : 'linear-gradient(135deg,color-mix(in srgb,var(--accent) 14%,#0a101c),#0a101c)' }}>
        <p className="text-[0.68rem] tracking-wide text-mist-500 uppercase">Aujourd’hui</p>
        <h2 className="mt-0.5 text-xl font-semibold text-mist-100">{advice.title}</h2>
        <p className="mt-0.5 text-sm text-mist-300">{advice.detail}</p>
        {!advice.rest && suggestion && (
          <div className="mt-3 rounded-2xl bg-black/25 p-3.5 hairline">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-base font-semibold text-accent tnum">{suggestion.code}</span>
              <div className="min-w-0">
                <p className="text-base leading-snug font-medium text-mist-100">{suggestion.title}</p>
                <p className="mt-0.5 text-xs text-mist-500">Semaine {suggestion.nextWeek}{suggestion.week?.label ? ` · ${suggestion.week.label}` : ''} <WeekNote week={suggestion.week} /></p>
                <p className="mt-1"><Duration program={program} code={suggestion.code} week={suggestion.nextWeek!} /></p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <Button variant="primary" className="!py-3.5 text-base" onClick={() => setRun({ code: suggestion.code, week: suggestion.nextWeek! })}>▶ Lancer</Button>
              <Button className="!py-3.5 text-base" onClick={() => setTick({ code: suggestion.code, week: suggestion.nextWeek! })}>✓ Déjà faite</Button>
            </div>
          </div>
        )}
        {!advice.rest && !suggestion && <p className="mt-2 text-sm text-mist-300">Tout le programme est fait. Bravo !</p>}
        {!advice.rest && others.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-mist-500">Ou lance une autre séance :</p>
            <div className="flex flex-wrap gap-2">
              {others.map((i) => (
                <button key={i.code} onClick={() => setRun({ code: i.code, week: i.nextWeek! })} className="min-h-10 rounded-xl bg-white/7 px-3 text-sm text-mist-100 hairline transition active:scale-95">
                  ▶ {i.code} <span className="text-mist-500">S{i.nextWeek}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/8 pt-2.5">
          <span className="text-[0.7rem] text-mist-500">Repos conseillé après</span>
          <Segmented value={String(restEvery)} onChange={(v) => void saveSettings({ restEvery: Number(v) })} options={[{ value: '2', label: '2 jours' }, { value: '3', label: '3 jours' }]} size="sm" />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <Button onClick={() => setEditing(true)}>✎ Modifier mon programme</Button>
        <Button onClick={() => setAdjust((v) => !v)}>{adjust ? 'Fermer' : 'Où j’en suis ?'}</Button>
      </div>

      {(nothingDone || adjust) && <SetupCard program={program} onDone={(n) => { setAdjust(false); toast.show(`${n} semaines marquées comme faites`) }} onDismiss={() => {
        setAdjust(false)
        try {
          window.localStorage.setItem(SETUP_KEY, '1')
        } catch {
          /* facultatif */
        }
        setDismissed(true)
      }} />}

      {rotation.map((r) => (
        <Card
          key={r.socle}
          title={`À faire · ${r.label}`}
          subtitle={`${r.doneTotal} / ${r.weeksTotal} semaines faites`}
          padded={false}
        >
          <div className="px-3 pb-3 sm:px-4">
            {r.available.length > 0 ? (
              <ul className="divide-y divide-white/6">
                {r.available.map((it) => (
                  <AvailableRow key={it.code} item={it} program={program} onTick={() => setTick({ code: it.code, week: it.nextWeek! })} onRun={() => setRun({ code: it.code, week: it.nextWeek! })} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-mist-500">Tout est fait dans ce socle.</p>
            )}
            {r.waiting.length > 0 && (
              <p className="mt-1 text-[0.7rem] text-mist-700">
                Plus tard, quand les autres sont faites : {r.waiting.map((i) => `${i.code} (S${i.nextWeek})`).join(' · ')}
              </p>
            )}
          </div>
        </Card>
      ))}

      <ProgramTable program={program} rotation={rotation} done={done} onTick={(code, week) => setTick({ code, week })} onUndo={(code, week) => setUndo({ code, week })} />

      <Card
        title={program.name}
        subtitle={span.start && span.end ? `Du ${dateLabel(span.start)} au ${dateLabel(span.end)}` : undefined}
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {rotation.map((r) => {
            const next = r.items.map((i) => i.nextWeek).filter((n): n is number => n !== null)
            const cur = next.length ? Math.min(...next) : null
            return (
              <div key={r.socle} className="rounded-xl bg-white/4 px-3 py-2 hairline">
                <div className="text-[0.62rem] tracking-wide text-mist-500 uppercase">{r.label}</div>
                <div className="text-lg font-semibold tnum text-mist-100">{cur === null ? 'Terminé' : `Semaine ${cur}`}</div>
                <div className="text-[0.66rem] text-mist-500">{r.doneTotal} cases cochées sur {r.weeksTotal}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[0.7rem] text-mist-500">
          <span>Au total : {stats.done} cases cochées sur {stats.total} ({program.sessions.length} séances × {Math.round(stats.total / Math.max(1, program.sessions.length))} semaines)</span>
        </div>
        <div className="mt-1.5">
          <ProgressBar ratio={stats.total ? stats.done / stats.total : 0} />
        </div>
      </Card>


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

      {run && <SessionRunner program={program} picks={[run]} light={light} onClose={() => setRun(null)} onSaved={(label) => toast.show(`${label} enregistrée ✓`)} />}
      {editing && <ProgramEditor program={program} onClose={() => setEditing(false)} onSaved={() => toast.show('Programme enregistré')} />}
      {tick && (
        <TickSheet
          program={program}
          code={tick.code}
          week={tick.week}
          light={light}
          onClose={() => setTick(null)}
          onDone={(label) => toast.show(`${label} faite ✓`)}
        />
      )}
      {undo && (
        <Sheet
          open
          onClose={() => setUndo(null)}
          title="Retirer cette coche ?"
          footer={
            <div className="flex gap-2">
              <Button
                variant="danger"
                full
                onClick={async () => {
                  await undoDone(all, undo.code, undo.week)
                  toast.show(`${undo.code} · S${undo.week} remise à faire`)
                  setUndo(null)
                }}
              >
                Oui, retirer
              </Button>
              <Button onClick={() => setUndo(null)}>Non</Button>
            </div>
          }
        >
          <p className="pb-2 text-sm text-mist-300">
            {undo.code} · semaine {undo.week} redevient « à faire ». Si elle avait été enregistrée dans ton journal, l’enregistrement est supprimé.
          </p>
        </Sheet>
      )}
    </div>
  )
}

/** Durée de la séance avec ses repos, avant de la lancer. */
function Duration({ program, code, week }: { program: Program; code: string; week: number }) {
  const t = useMemo(() => sessionTiming(program, code, week), [program, code, week])
  if (!t || !t.sets) return null
  return (
    <span className="text-xs text-mist-300">
      <b className="text-sm font-semibold text-mist-100 tnum">⏱ {fmtDuration(t.totalSec)}</b>
      <span className="text-mist-500"> · repos {fmtDuration(t.restSec)} · {t.sets} séries</span>
    </span>
  )
}

/* ── Une séance dont c'est le tour ───────────────────────────────────── */

function AvailableRow({ item, program, onTick, onRun }: { item: RotationItem; program: Program; onTick: () => void; onRun: () => void }) {
  const session = program.sessions.find((s) => s.code === item.code)!
  const [open, setOpen] = useState(false)
  return (
    <li className="py-3.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left" aria-expanded={open}>
        <span className="mt-0.5 w-10 shrink-0 rounded-md bg-accent/15 py-1 text-center text-sm font-semibold text-accent tnum">{item.code}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] leading-snug text-mist-100">{item.title}</span>
          <span className="mt-0.5 block text-xs text-mist-500">
            Semaine {item.nextWeek}
            {item.week?.label ? ` · ${item.week.label}` : ''} <WeekNote week={item.week} /> · {open ? 'masquer' : 'voir le détail'}
          </span>
          <span className="mt-1 block"><Duration program={program} code={item.code} week={item.nextWeek!} /></span>
        </span>
      </button>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Button variant="primary" onClick={onRun} aria-label={`Lancer la séance guidée ${item.code} semaine ${item.nextWeek}`}>▶ Lancer</Button>
        <Button onClick={onTick} aria-label={`Marquer ${item.code} semaine ${item.nextWeek} comme faite`}>✓ Déjà faite</Button>
      </div>
      {open && <SessionPreview session={session} week={item.nextWeek!} />}
    </li>
  )
}

/* ── Où en es-tu ? (une seule fois) ──────────────────────────────────── */

function SetupCard({ program, onDone, onDismiss }: { program: Program; onDone: (n: number) => void; onDismiss: () => void }) {
  const socles = SOCLE_ORDER.filter((s) => program.sessions.some((x) => socleOf(x.code) === s))
  const [weeks, setWeeks] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  return (
    <Card title="Où en es-tu ?" subtitle="Indique les semaines déjà faites : elles seront grisées et le roulement reprendra à la suite.">
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {socles.map((s) => (
          <div key={s}>
            <div className="mb-1 text-xs text-mist-300">{SOCLE_LABEL[s] ?? s}</div>
            <Stepper value={weeks[s] ?? 0} onChange={(v) => setWeeks((w) => ({ ...w, [s]: v }))} min={0} max={12} suffix="sem." />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[0.68rem] text-mist-700">
        0 = pas encore commencé. Ces semaines sont de simples coches : elles ne créent aucune séance dans ton journal et ne touchent pas à ta fatigue.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          disabled={busy || !Object.values(weeks).some((v) => v > 0)}
          onClick={async () => {
            setBusy(true)
            const n = await saveProgress(program, weeks)
            setBusy(false)
            onDone(n)
          }}
        >
          Enregistrer mon avancement
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Je commence à zéro
        </Button>
      </div>
    </Card>
  )
}
