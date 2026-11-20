import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { DayKey, Program, SetEntry, Workout } from '../../types'
import { plannedWeeks } from '../../engine/program'
import { SOCLE_LABEL, SOCLE_ORDER, socleOf } from '../../engine/rotation'
import { sessionWeekStart, weekLabel } from '../../engine/todayPlan'
import { defaultWeek, draftSession, findDuplicate, sessionChoices, workoutFromSession } from '../../engine/programSession'
import { saveWorkout } from '../../db/repo'
import { uid } from '../../db/db'
import { mergeProgramWithWhoop } from '../../db/seed'
import { parseDay } from '../../engine/time'
import { Button, Field, Sheet, Stepper, TextArea, TextInput } from '../ui/primitives'
import { useNames } from './SessionRunner'
import { hasIntervals, phasesMinutes, runPhases } from '../../engine/run'
import { IntervalTimer, ShinCheck } from './RunParts'

const isRunCode = (c: string | null) => !!c && socleOf(c) === 'course'
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Un champ numérique qui garde ce qu'on tape (« 7, » en route vers « 7,5 ») et renvoie un nombre ou rien. */
function NumField({ value, onChange, label, decimal }: { value?: number; onChange: (v: number | undefined) => void; label: string; decimal?: boolean }) {
  const [text, setText] = useState(value === undefined ? '' : String(value).replace('.', ','))
  return (
    <TextInput
      aria-label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value.replace(',', '.'))
        onChange(e.target.value.trim() === '' || !Number.isFinite(n) ? undefined : n)
      }}
      className="!py-3 text-center"
    />
  )
}

/** Le champ principal d'une série : tenue (s), distance (m) ou répétitions. */
const mainKey = (s: SetEntry): 'holdSec' | 'distanceM' | 'reps' => (s.holdSec !== undefined ? 'holdSec' : s.distanceM !== undefined && s.reps === undefined ? 'distanceM' : 'reps')
const MAIN_LABEL = { holdSec: 'Tenue (s)', distanceM: 'Distance (m)', reps: 'Reps' } as const

function plannedText(s: SetEntry): string {
  const k = mainKey(s)
  const main = s[k] === undefined ? 'à fixer' : k === 'reps' ? `${s.reps} reps` : k === 'holdSec' ? `${s.holdSec} s` : `${s.distanceM} m`
  const load = s.loadKg ? ` · ${s.loadKg > 0 ? '+' : ''}${s.loadKg} kg` : ''
  return `prévu : ${main}${load}`
}

/**
 * Une séance du programme saisie à la main : on choisit la séance et la semaine, les séries de la prescription sont préremplies,
 * on corrige ce qui a été fait. Jour passé = rattrapage ; jour futur = séance « prévue » à valider plus tard.
 * Sert aussi à cocher une case de la grille (le jour est alors demandé) et à valider une séance prévue (`existing`).
 */
export default function ProgramSessionSheet({
  program,
  day: initialDay,
  code: initialCode,
  week: initialWeek,
  existing,
  onClose,
  onSaved,
}: {
  program: Program
  day: DayKey
  code?: string
  week?: number
  existing?: Workout
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const data = useSoma()
  const today = data.today
  const override = data.settings.programStart
  const choices = useMemo(() => sessionChoices(program), [program])
  const locked = !!existing
  const [code, setCode] = useState<string | null>(existing?.program?.[0]?.code ?? initialCode ?? null)
  const [weekPick, setWeekPick] = useState<number | null>(existing?.program?.[0]?.week ?? initialWeek ?? null)
  const [day, setDay] = useState<DayKey>(existing ? (existing.day <= today ? existing.day : today) : initialDay)
  const session = program.sessions.find((s) => s.code === code)
  const week = session ? (weekPick ?? defaultWeek(program, session, day, override)) : null
  const weekDef = session?.weeks.find((w) => w.n === week)
  const draft = useMemo(() => (code && week ? draftSession(program, code, week, () => uid('set')) : null), [program, code, week])

  const [time, setTime] = useState(() => (existing ? hhmm(new Date(existing.startedAt)) : initialDay === today ? hhmm(new Date(Date.now() - 45 * 60_000)) : '18:00'))
  const [edits, setEdits] = useState<{ key: string; sets: SetEntry[]; duration: number } | null>(null)
  const [rpe, setRpe] = useState(existing?.rpe ?? 7)
  const [note, setNote] = useState('')
  const [dupAsk, setDupAsk] = useState(false)
  const [distance, setDistance] = useState('')
  const [shinBefore, setShinBefore] = useState(0)
  const [shinAfter, setShinAfter] = useState(0)
  const [timer, setTimer] = useState(false)
  const [busy, setBusy] = useState(false)

  /* Les séries éditables repartent de la prescription dès que la séance ou la semaine change. */
  const key = `${code}|${week}`
  const live = edits?.key === key ? edits : null
  const sets = live?.sets ?? (existing && existing.program?.[0]?.code === code && existing.program?.[0]?.week === week ? existing.sets ?? [] : draft?.sets ?? [])
  const duration = live?.duration ?? (existing && existing.program?.[0]?.code === code ? existing.durationMin : isRunCode(code) && phasesMinutes(runPhases(draft?.sets ?? [])) ? phasesMinutes(runPhases(draft?.sets ?? [])) : draft?.durationMin ?? 45)
  const setSets = (next: SetEntry[]) => setEdits({ key, sets: next, duration })
  const setDuration = (d: number) => setEdits({ key, sets, duration: d })

  const names = useNames(program, code && week ? [{ code, week }] : [])
  const future = day > today
  const isRun = !!code && socleOf(code) === 'course'
  const phases = useMemo(() => runPhases(draft?.sets ?? []), [draft])
  const prescription = session && week ? session.blocks.map((b) => ({ name: b.name, text: b.cells[session.weeks.findIndex((w) => w.n === week)] ?? '' })).filter((b) => b.text) : []
  const dup = code && week ? findDuplicate(data.workouts, code, week, day, existing?.id) : undefined
  const start = session && week ? sessionWeekStart(program, session, session.weeks.findIndex((w) => w.n === week), override) : null

  const save = async () => {
    if (!draft || !code || !week) return
    if (dup && !dupAsk) {
      setDupAsk(true)
      return
    }
    setBusy(true)
    const kept = future ? sets : sets.filter((s) => (s[mainKey(s)] ?? 0) > 0)
    const w = workoutFromSession({
      id: uid('w'),
      draft: existing ? { ...draft, notes: '' } : draft,
      day,
      time,
      durationMin: duration,
      rpe,
      note: existing && !note.trim() ? existing.notes ?? '' : note,
      sets: isRun ? [] : kept,
      run: isRun
        ? {
            runType: 'footing',
            durationSec: Math.max(1, duration || phasesMinutes(phases)) * 60,
            distanceM: Number(distance.replace(',', '.')) > 0 ? Math.round(Number(distance.replace(',', '.')) * 1000) : undefined,
            ...(future ? {} : { shinPainBefore: shinBefore, shinPain: shinAfter }),
          }
        : undefined,
      today,
      now: new Date().toISOString(),
      existing,
    })
    await saveWorkout(w)
    await mergeProgramWithWhoop()
    onSaved(future ? `${code} · S${week} prévue le ${format(parseDay(day), 'd MMM', { locale: fr })}` : `${code} · S${week} enregistrée`)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={existing ? 'Valider la séance prévue' : 'Séance du programme'}
      footer={
        code && week && draft ? (
          dupAsk && dup ? (
            <div className="space-y-2.5">
              <p role="alert" className="rounded-xl bg-[#ffc24b]/12 px-3 py-2.5 text-sm text-[#ffd98a]">
                {code} · semaine {week} existe déjà le {format(parseDay(day), 'd MMMM', { locale: fr })}{dup.planned ? ' (prévue)' : ''}. L’ajouter quand même ?
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="primary" disabled={busy} onClick={save}>Ajouter quand même</Button>
                <Button onClick={() => setDupAsk(false)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" full disabled={busy} onClick={save}>
              {future ? 'Prévoir cette séance' : existing ? 'Séance faite ✓' : 'Enregistrer la séance'}
            </Button>
          )
        ) : undefined
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jour">
            <TextInput type="date" value={day} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setDupAsk(false) } }} />
          </Field>
          <Field label="Heure de début">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        {!locked && (
          <Field label="Séance" group>
            <div className="space-y-2">
              {SOCLE_ORDER.map((so) => {
                const list = choices.filter((s) => socleOf(s.code) === so)
                if (!list.length) return null
                return (
                  <div key={so}>
                    <p className="mb-1 text-[0.64rem] tracking-[0.12em] text-mist-500 uppercase">{SOCLE_LABEL[so] ?? so}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {list.map((s) => (
                        <button
                          key={s.code}
                          type="button"
                          aria-pressed={code === s.code}
                          onClick={() => { setCode(s.code); setWeekPick(null); setDupAsk(false) }}
                          className={`min-h-12 rounded-xl text-base font-semibold tnum transition active:scale-95 ${code === s.code ? 'bg-accent text-ink-950' : 'bg-white/6 text-mist-100 hairline'}`}
                        >
                          {s.code}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
              {choices.length === 0 && <p className="text-sm text-mist-500">Aucune séance avec du contenu dans ce programme.</p>}
            </div>
          </Field>
        )}

        {session && (
          <p className="text-sm text-mist-100">
            <b className="text-accent">{session.code}</b> · {session.title}
          </p>
        )}

        {session && !locked && (
          <Field label="Semaine du programme" group hint={weekDef ? `Semaine ${weekDef.n}${start ? ` · ${weekLabel(start)}` : ''}${weekDef.light ? ' · décharge' : ''}${weekDef.test ? ' · test' : ''}. Par défaut : la semaine qui contient ce jour.` : undefined}>
            <div className="grid grid-cols-6 gap-1.5">
              {plannedWeeks(session).map((w) => (
                <button
                  key={w.n}
                  type="button"
                  aria-pressed={week === w.n}
                  aria-label={`Semaine ${w.n}${w.light ? ' (décharge)' : ''}${w.test ? ' (test)' : ''}`}
                  onClick={() => { setWeekPick(w.n); setDupAsk(false) }}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-xl text-sm font-semibold tnum transition active:scale-95 ${week === w.n ? 'bg-accent text-ink-950' : 'bg-white/6 text-mist-100 hairline'}`}
                >
                  {w.n}
                  <span className={`text-[0.55rem] font-normal ${week === w.n ? 'text-ink-950/70' : 'text-mist-500'}`}>{w.test ? 'test' : w.light ? 'décharge' : `S${w.n}`}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        {session && locked && weekDef && <p className="text-xs text-mist-500">Semaine {weekDef.n}{start ? ` · ${weekLabel(start)}` : ''}</p>}

        {session && week && draft && (
          <>
            <p className={`rounded-xl px-3 py-2.5 text-xs ${future ? 'bg-accent/10 text-accent' : 'bg-white/5 text-mist-300'}`}>
              {future
                ? 'Jour à venir : la séance est enregistrée comme « prévue ». Elle ne coche rien tant que tu ne l’as pas validée.'
                : existing
                  ? 'Tu valides cette séance : corrige ce que tu as vraiment fait, puis enregistre.'
                  : day === today
                    ? 'Les séries prévues sont préremplies : corrige ce que tu as vraiment fait.'
                    : 'Rattrapage : les séries prévues sont préremplies, corrige ce que tu as vraiment fait.'}
            </p>

            {isRun && (
              <div className="space-y-3">
                <div className="rounded-xl bg-white/5 px-3 py-3 hairline">
                  <p className="mb-1 text-xs text-mist-500">Prévu</p>
                  {prescription.map((b) => (
                    <p key={b.name} className="text-base text-mist-100">{b.name !== session.title && b.name ? `${b.name} : ` : ''}{b.text}</p>
                  ))}
                  {hasIntervals(phases) && <Button className="mt-3" full onClick={() => setTimer(true)}>⏱ Chrono d’intervalles (trot / marche)</Button>}
                </div>
                {!future && <ShinCheck label="Avant de partir : douleur au tibia" value={shinBefore} onChange={setShinBefore} advice />}
                <Field label="Distance (km)" optional>
                  <TextInput inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="4,5" />
                </Field>
                {!future && <ShinCheck label="Après la sortie : douleur au tibia" value={shinAfter} onChange={setShinAfter} />}
              </div>
            )}

            <div className="space-y-3">
              {!isRun && sets.length === 0 && <p className="text-sm text-mist-500">Rien de détaillé n’est prévu : tu peux quand même enregistrer la séance.</p>}
              {!isRun && sets.map((s, i) => {
                const name = names(s)
                const first = i === 0 || names(sets[i - 1]) !== name
                const k = mainKey(s)
                const n = sets.slice(0, i + 1).filter((x) => names(x) === name).length
                return (
                  <div key={s.id}>
                    {first && <p className="mb-1.5 text-[0.95rem] font-medium text-mist-100">{name}</p>}
                    <div className="grid grid-cols-[3.2rem_1fr_1fr] items-center gap-2">
                      <span className="text-xs text-mist-500 tnum">Série {n}</span>
                      <NumField label={`${name} série ${n} : ${MAIN_LABEL[k]}`} value={s[k]} onChange={(v) => setSets(sets.map((x) => (x.id === s.id ? { ...x, [k]: v } : x)))} />
                      <NumField label={`${name} série ${n} : charge en kg`} decimal value={s.loadKg} onChange={(v) => setSets(sets.map((x) => (x.id === s.id ? { ...x, loadKg: v } : x)))} />
                    </div>
                    <p className="mt-0.5 pl-[3.7rem] text-[0.62rem] text-mist-700">{plannedText(s)} · {MAIN_LABEL[k].toLowerCase()} / charge kg</p>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!future && (
                <Field label="Effort (1 à 10)" group>
                  <Stepper value={rpe} onChange={setRpe} min={1} max={10} />
                </Field>
              )}
              <Field label="Durée (min)">
                <TextInput inputMode="numeric" value={duration ? String(duration) : ''} onChange={(e) => setDuration(Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </Field>
            </div>
            <Field label="Note" optional>
              <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ressenti, séries ratées, douleur…" />
            </Field>
          </>
        )}
      </div>
      {timer && <IntervalTimer phases={phases} onClose={() => setTimer(false)} />}
    </Sheet>
  )
}
