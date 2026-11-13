import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { programSpan, programStats, type BuiltWorkout } from '../../engine/program'
import { SOCLE_LABEL, SOCLE_ORDER, socleOf, type RotationItem } from '../../engine/rotation'
import { deleteProgram } from '../../db/repo'
import { Button, Card, ProgressBar, Sheet, Stepper, useToast } from '../ui/primitives'
import { CoachBanners, ImpactNotice, useImpact } from './advice'
import SessionPreview from './SessionPreview'
import TickSheet from './TickSheet'
import { WeekNote } from './weekNote'
import { useRotation } from './useRotation'
import { saveProgress, undoDone } from './programActions'

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

export default function ProgramBoard({ program, onStart }: { program: Program; onStart: (w: BuiltWorkout, day?: string) => void }) {
  const data = useSoma()
  const toast = useToast()
  const { rotation, all } = useRotation()
  const stats = useMemo(() => programStats(program, all, data.today), [program, all, data.today])
  const span = programSpan(program)
  const [tick, setTick] = useState<{ code: string; week: number } | null>(null)
  const [undo, setUndo] = useState<{ code: string; week: number } | null>(null)
  const [light, setLight] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const dateLabel = (d?: string) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '')
  const nothingDone = stats.done === 0 && !dismissed

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
        </div>
        <div className="mt-1.5">
          <ProgressBar ratio={stats.total ? stats.done / stats.total : 0} />
        </div>
      </Card>

      {nothingDone && <SetupCard program={program} onDone={(n) => toast.show(`${n} semaines marquées comme faites`)} onDismiss={() => {
        try {
          window.localStorage.setItem(SETUP_KEY, '1')
        } catch {
          /* facultatif */
        }
        setDismissed(true)
      }} />}

      <CoachBanners light={light} onLight={setLight} />

      {rotation.map((r) => (
        <Card
          key={r.socle}
          title={r.label}
          subtitle={`${r.doneTotal} / ${r.weeksTotal} semaines faites`}
          padded={false}
        >
          <div className="px-3 pb-3 sm:px-4">
            {r.available.length > 0 ? (
              <ul className="divide-y divide-white/6">
                {r.available.map((it) => (
                  <AvailableRow key={it.code} item={it} program={program} onTick={() => setTick({ code: it.code, week: it.nextWeek! })} />
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
            <History
              items={r.items}
              program={program}
              onUndo={(code, week) => setUndo({ code, week })}
              onTick={(code, week) => setTick({ code, week })}
            />
          </div>
        </Card>
      ))}

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

      {tick && (
        <TickSheet
          program={program}
          code={tick.code}
          week={tick.week}
          light={light}
          onClose={() => setTick(null)}
          onDone={(label) => toast.show(`${label} faite ✓`)}
          onDetail={(b, day) => onStart(b, day)}
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

/* ── Une séance dont c'est le tour ───────────────────────────────────── */

function AvailableRow({ item, program, onTick }: { item: RotationItem; program: Program; onTick: () => void }) {
  const session = program.sessions.find((s) => s.code === item.code)!
  const [open, setOpen] = useState(false)
  const impact = useImpact([{ code: item.code, week: item.nextWeek! }], program.sessions)
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="w-9 shrink-0 rounded-md bg-accent/15 py-0.5 text-center text-sm font-semibold text-accent tnum">{item.code}</span>
        <button onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block truncate text-sm text-mist-100">{item.title}</span>
          <span className="block truncate text-[0.68rem] text-mist-500">
            Semaine {item.nextWeek}
            {item.week?.label ? ` · ${item.week.label}` : ''} <WeekNote week={item.week} /> · {open ? 'masquer' : 'voir le détail'}
          </span>
        </button>
        <button
          onClick={onTick}
          aria-label={`Marquer ${item.code} semaine ${item.nextWeek} comme faite`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6 text-mist-300 transition active:scale-95 hover:bg-accent/20 hover:text-accent"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5">
            <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {impact.length > 0 && (
        <div className="mt-2">
          <ImpactNotice impact={impact} />
        </div>
      )}
      {open && <SessionPreview session={session} week={item.nextWeek!} />}
    </li>
  )
}

/* ── Historique et corrections (replié, grisé) ───────────────────────── */

function History({
  items,
  program,
  onUndo,
  onTick,
}: {
  items: RotationItem[]
  program: Program
  onUndo: (code: string, week: number) => void
  onTick: (code: string, week: number) => void
}) {
  const [open, setOpen] = useState(false)
  const total = items.reduce((a, i) => a + i.doneWeeks.length, 0)
  if (!total && !open) {
    return null
  }
  return (
    <div className="mt-2 border-t border-white/6 pt-2">
      <button onClick={() => setOpen((o) => !o)} className="text-[0.7rem] text-mist-700 hover:text-mist-500" aria-expanded={open}>
        {open ? '▾' : '▸'} Faites ({total}) et corrections
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-2">
          {items.map((it) => {
            const session = program.sessions.find((s) => s.code === it.code)!
            return (
              <li key={it.code} className="opacity-80">
                <div className="mb-1 text-[0.7rem] text-mist-500">
                  {it.code} · {it.title}
                </div>
                <div className="scroll-x flex gap-1" role="group" aria-label={`Semaines de ${it.code}`}>
                  {session.weeks.map((w) => {
                    const isDone = it.doneWeeks.includes(w.n)
                    return (
                      <button
                        key={w.n}
                        onClick={() => (isDone ? onUndo(it.code, w.n) : onTick(it.code, w.n))}
                        title={`${w.label}${w.light ? ' · légère' : ''}${w.test ? ' · test' : ''}${isDone ? ' · faite (toucher pour retirer)' : ' · toucher pour cocher'}`}
                        className="grid h-7 min-w-7 shrink-0 place-items-center rounded-md text-[0.68rem] tnum"
                        style={{
                          background: isDone ? '#ffffff08' : '#ffffff0f',
                          color: isDone ? '#56657d' : w.test ? '#6fa8ffb3' : w.light ? '#d6b25bb3' : '#b9c6dc',
                          textDecoration: isDone ? 'line-through' : undefined,
                        }}
                      >
                        {isDone ? `✓${w.n}` : w.n}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
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
