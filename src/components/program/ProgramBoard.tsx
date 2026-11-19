import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { programSpan, programStats } from '../../engine/program'
import { pickSuggestion } from '../../engine/simpleAdvice'
import { SOCLE_LABEL, SOCLE_ORDER, socleOf, type RotationItem, type SocleRotation } from '../../engine/rotation'
import { deleteProgram } from '../../db/repo'
import { Button, Card, ProgressBar, Segmented, Sheet, Stepper, useToast } from '../ui/primitives'
import SessionPreview from './SessionPreview'
import TickSheet from './TickSheet'
import { WeekNote } from './weekNote'
import { useRotation } from './useRotation'
import ProgramTable from './ProgramTable'
import ProgramEditor from './ProgramEditor'
import SessionRunner from './SessionRunner'
import WorkoutCalendar from './WorkoutCalendar'
import TodayCard, { DetailList } from './TodayCard'
import { currentWeek, recommend, weekPlan, type PlanItem } from '../../engine/todayPlan'
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
  const suggestion = useMemo(() => pickSuggestion(rotation), [rotation])
  const [launch, setLaunch] = useState(false)
  const week = useMemo(() => currentWeek(program, data.today, data.settings.programStart), [program, data.today, data.settings.programStart])
  const rec = useMemo(
    () => (week && week.state === 'during' ? recommend({ program, workouts: data.workouts, done, week, nowMs: data.nowMs, override: data.settings.programStart }) : null),
    [program, week, data.workouts, done, data.nowMs, data.settings.programStart],
  )
  const weekItems = useMemo(() => (week && week.state === 'during' ? weekPlan(program, week, done, data.settings.programStart) : null), [program, week, done, data.settings.programStart])

  return (
    <div className="flex flex-col gap-3">
      {toast.node}
      <TodayCard program={program} week={week} rec={rec} onRun={(code, week) => setRun({ code, week })} onTick={(code, week) => setTick({ code, week })} onChoose={() => setLaunch(true)} />

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

      <WorkoutCalendar />

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

      {launch && (
        <Sheet open onClose={() => setLaunch(false)} title="Quelle séance ?" wide>
          <LaunchList
            program={program}
            rotation={rotation}
            weekItems={weekItems}
            suggestion={rec?.pick?.code ?? suggestion?.code}
            onRun={(code, week) => { setLaunch(false); setRun({ code, week }) }}
            onTick={(code, week) => { setLaunch(false); setTick({ code, week }) }}
          />
        </Sheet>
      )}
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

/** Les séances restantes, par famille : on choisit celle qu'on veut faire. */
function LaunchList({ program, rotation, weekItems, suggestion, onRun, onTick }: { program: Program; rotation: SocleRotation[]; weekItems: PlanItem[] | null; suggestion?: string; onRun: (code: string, week: number) => void; onTick: (code: string, week: number) => void }) {
  /* Pendant le programme : seulement ce qui est prévu cette semaine (jamais un bloc sans rien de prévu). Hors période : le roulement habituel. */
  const groups = weekItems
    ? SOCLE_ORDER.map((so) => ({ socle: so, label: SOCLE_LABEL[so] ?? so, items: weekItems.filter((p) => socleOf(p.code) === so) })).filter((g) => g.items.length)
    : []
  const rot = rotation.filter((r) => r.available.length)
  const first = groups.find((g) => g.items.some((i) => i.code === suggestion))?.socle ?? groups[0]?.socle ?? rot[0]?.socle
  const [fam, setFam] = useState(first)
  if (weekItems) {
    const cur = groups.find((g) => g.socle === fam) ?? groups[0]
    if (!cur) return <p className="py-6 text-center text-sm text-mist-300">Rien n’est prévu cette semaine.</p>
    return (
      <div className="pb-2">
        <div className="scroll-x">
          <Segmented value={cur.socle} onChange={setFam} options={groups.map((g) => ({ value: g.socle, label: `${g.label} (${g.items.filter((i) => !i.done).length})` }))} />
        </div>
        <ul className="mt-2 divide-y divide-white/6">
          {cur.items.map((it) => (
            <WeekRow key={it.code} item={it} program={program} recommended={it.code === suggestion} onRun={() => onRun(it.code, it.weekN)} onTick={() => onTick(it.code, it.weekN)} />
          ))}
        </ul>
      </div>
    )
  }
  const cur = rot.find((g) => g.socle === fam) ?? rot[0]
  if (!cur) return <p className="py-6 text-center text-sm text-mist-300">Tout est fait : bravo !</p>
  return (
    <div className="pb-2">
      <div className="scroll-x">
        <Segmented value={cur.socle} onChange={setFam} options={rot.map((g) => ({ value: g.socle, label: g.label }))} />
      </div>
      <ul className="mt-2 divide-y divide-white/6">
        {cur.available.map((it) => (
          <AvailableRow key={it.code} item={it} program={program} recommended={it.code === suggestion} onTick={() => onTick(it.code, it.nextWeek!)} onRun={() => onRun(it.code, it.nextWeek!)} />
        ))}
      </ul>
    </div>
  )
}

/** Une séance prévue cette semaine : détail repliable, durée, ▶ Lancer. */
function WeekRow({ item, program, recommended, onRun, onTick }: { item: PlanItem; program: Program; recommended?: boolean; onRun: () => void; onTick: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`py-3.5 ${item.done ? 'opacity-60' : ''}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left" aria-expanded={open}>
        <span className="mt-0.5 w-10 shrink-0 rounded-md bg-accent/15 py-1 text-center text-sm font-semibold text-accent tnum">{item.code}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] leading-snug text-mist-100">
            {item.title}
            {recommended && !item.done && <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.62rem] font-medium text-accent">conseillée</span>}
            {item.done && <span className="ml-2 rounded-md bg-[#41e08a]/15 px-1.5 py-0.5 text-[0.62rem] font-medium text-[#41e08a]">faite cette semaine</span>}
          </span>
          <span className="mt-0.5 block text-xs text-mist-500">
            Semaine {item.weekN} · {item.label}
            {item.light ? ' · décharge' : ''}
            {item.test ? ' · test' : ''} · {open ? 'masquer' : 'voir le détail'}
          </span>
          <span className="mt-1 block"><Duration program={program} code={item.code} week={item.weekN} /></span>
        </span>
      </button>
      {open && <div className="mt-1 rounded-xl bg-white/4 px-3 hairline"><DetailList detail={item.detail} /></div>}
      {!item.done && (
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Button variant="primary" onClick={onRun} aria-label={`Lancer la séance guidée ${item.code} semaine ${item.weekN}`}>▶ Lancer</Button>
          <Button onClick={onTick} aria-label={`Marquer ${item.code} semaine ${item.weekN} comme faite`}>✓ Déjà faite</Button>
        </div>
      )}
    </li>
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

function AvailableRow({ item, program, onTick, onRun, recommended }: { item: RotationItem; program: Program; onTick: () => void; onRun: () => void; recommended?: boolean }) {
  const session = program.sessions.find((s) => s.code === item.code)!
  const [open, setOpen] = useState(false)
  return (
    <li className="py-3.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left" aria-expanded={open}>
        <span className="mt-0.5 w-10 shrink-0 rounded-md bg-accent/15 py-1 text-center text-sm font-semibold text-accent tnum">{item.code}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] leading-snug text-mist-100">{item.title}{recommended && <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[0.62rem] font-medium text-accent">conseillée</span>}</span>
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
