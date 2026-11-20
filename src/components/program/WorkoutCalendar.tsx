import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { DayKey, Workout } from '../../types'
import { CATEGORY_COLOR, CATEGORY_LABEL, buildExtraWorkout, categoryOf, monthGrid, plannedByDay, workoutsByDay, type ExtraWorkoutInput } from '../../engine/calendar'
import { deleteWorkout, saveWorkout } from '../../db/repo'
import { uid } from '../../db/db'
import { parseDay, todayKey } from '../../engine/time'
import { Button, Card, Field, Segmented, Sheet, Stepper, TextInput, useToast } from '../ui/primitives'
import ProgramSessionSheet from './ProgramSessionSheet'
import { ShinCheck } from './RunParts'
import { sessionChoices } from '../../engine/programSession'

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Calendrier de ce que j'ai fait : les séances du programme s'y ajoutent toutes seules, et on peut noter une course, une natation… */
export default function WorkoutCalendar() {
  const data = useSoma()
  const today = todayKey()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [openDay, setOpenDay] = useState<DayKey | null>(null)
  const [adding, setAdding] = useState<DayKey | null>(null)
  const [progAdd, setProgAdd] = useState<{ day: DayKey; existing?: Workout } | null>(null)
  const toast = useToast()
  const byDay = useMemo(() => workoutsByDay(data.workouts), [data.workouts])
  const plannedDay = useMemo(() => plannedByDay(data.workouts), [data.workouts])
  const hasProgram = !!data.program && sessionChoices(data.program).length > 0
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m, data.settings.weekStartsOn), [cursor, data.settings.weekStartsOn])
  const dow = data.settings.weekStartsOn === 1 ? DOW : ['D', ...DOW.slice(0, 6)]
  const monthWorkouts = grid.filter((c) => c.inMonth).flatMap((c) => byDay.get(c.day) ?? [])
  const monthMinutes = monthWorkouts.reduce((a, w) => a + w.durationMin, 0)
  const shift = (n: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  return (
    <Card title="Calendrier" subtitle="Tout ce que tu as fait : séances du programme, course, natation…">
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} aria-label="Mois précédent" className="grid h-11 w-11 place-items-center rounded-xl bg-white/6 text-lg text-mist-300 active:scale-95">‹</button>
        <p className="text-base font-medium text-mist-100 capitalize">{format(new Date(cursor.y, cursor.m, 1), 'LLLL yyyy', { locale: fr })}</p>
        <button onClick={() => shift(1)} aria-label="Mois suivant" className="grid h-11 w-11 place-items-center rounded-xl bg-white/6 text-lg text-mist-300 active:scale-95">›</button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[0.68rem] text-mist-500">
        {dow.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((c) => {
          const ws = byDay.get(c.day) ?? []
          const ps = plannedDay.get(c.day) ?? []
          const isToday = c.day === today
          return (
            <button
              key={c.day}
              onClick={() => setOpenDay(c.day)}
              aria-label={`${format(parseDay(c.day), 'd MMMM', { locale: fr })}${ws.length ? ` : ${ws.length} séance${ws.length > 1 ? 's' : ''}` : ''}${ps.length ? ` : ${ps.length} prévue${ps.length > 1 ? 's' : ''}` : ''}`}
              className={`flex h-12 flex-col items-center justify-between rounded-lg py-1 text-[0.8rem] transition active:scale-95 ${c.inMonth ? 'bg-white/5 text-mist-100' : 'text-mist-700'} ${isToday ? 'ring-2 ring-accent' : ''}`}
            >
              <span className={`tnum ${isToday ? 'font-semibold text-accent' : ''}`}>{Number(c.day.slice(8))}</span>
              <span className="flex h-2 items-center gap-0.5">
                {ws.slice(0, 4).map((w) => (
                  <i key={w.id} className="block h-1.5 w-1.5 rounded-full" style={{ background: CATEGORY_COLOR[categoryOf(w)] }} />
                ))}
                {ps.slice(0, Math.max(0, 4 - ws.length)).map((w) => (
                  <i key={w.id} className="block h-1.5 w-1.5 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${CATEGORY_COLOR[categoryOf(w)]}` }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-mist-500">
        {(['street', 'jambes', 'abdos', 'course', 'natation'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <i className="block h-2 w-2 rounded-full" style={{ background: CATEGORY_COLOR[k] }} />
            {CATEGORY_LABEL[k]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <i className="block h-2 w-2 rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px #9fb6d6' }} />
          Prévue
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-mist-300">
          Ce mois-ci : <b className="text-mist-100">{monthWorkouts.length} séance{monthWorkouts.length > 1 ? 's' : ''}</b>
          {monthMinutes ? ` · ${Math.floor(monthMinutes / 60)} h ${String(monthMinutes % 60).padStart(2, '0')}` : ''}
        </p>
        <Button onClick={() => setOpenDay(today)}>+ Ajouter une séance</Button>
      </div>

      {openDay && (
        <DaySheet
          day={openDay}
          workouts={byDay.get(openDay) ?? []}
          planned={plannedDay.get(openDay) ?? []}
          canProgram={hasProgram}
          onClose={() => setOpenDay(null)}
          onFree={() => { setAdding(openDay); setOpenDay(null) }}
          onProgram={() => { setProgAdd({ day: openDay }); setOpenDay(null) }}
          onValidate={(w) => { setProgAdd({ day: w.day, existing: w }); setOpenDay(null) }}
        />
      )}
      {adding && <AddSheet day={adding} onClose={() => setAdding(null)} />}
      {progAdd && data.program && <ProgramSessionSheet program={data.program} day={progAdd.day} existing={progAdd.existing} onClose={() => setProgAdd(null)} onSaved={(m) => toast.show(m)} />}
      {toast.node}
    </Card>
  )
}

function DaySheet({ day, workouts, planned, canProgram, onClose, onFree, onProgram, onValidate }: { day: DayKey; workouts: Workout[]; planned: Workout[]; canProgram: boolean; onClose: () => void; onFree: () => void; onProgram: () => void; onValidate: (w: Workout) => void }) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={format(parseDay(day), 'EEEE d MMMM', { locale: fr })}
      footer={
        <div>
          <p className="mb-2 text-xs text-mist-500">Ajouter une séance ce jour-là :</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button full onClick={onFree}>Séance libre</Button>
            <Button full variant="primary" disabled={!canProgram} onClick={onProgram}>Séance du programme</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        {workouts.length === 0 && planned.length === 0 && <p className="py-4 text-center text-sm text-mist-500">Aucune séance ce jour-là.</p>}
        {planned.map((w) => (
          <PlannedCard key={w.id} w={w} onValidate={() => onValidate(w)} />
        ))}
        {workouts.map((w) => (
          <WorkoutCard key={w.id} w={w} />
        ))}
      </div>
    </Sheet>
  )
}

/** Une séance du programme placée à l'avance : on la valide quand elle est faite, ou on la retire. */
function PlannedCard({ w, onValidate }: { w: Workout; onValidate: () => void }) {
  const cat = categoryOf(w)
  return (
    <div className="rounded-2xl bg-white/3 p-3.5" style={{ border: `1.5px dashed ${CATEGORY_COLOR[cat]}88` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.95rem] leading-snug font-medium text-mist-100">{w.title || CATEGORY_LABEL[cat]}</p>
          <p className="text-xs text-mist-500">Prévue · {CATEGORY_LABEL[cat]} · {w.durationMin} min{!w.plan?.auto || w.plan.locked ? ' · 📌 épinglée' : ''}</p>
          {w.plan?.reason && <p className="mt-0.5 text-xs text-mist-300">{w.plan.reason}</p>}
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Button variant="primary" onClick={onValidate}>Valider ✓</Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (window.confirm('Retirer cette séance prévue ?')) await deleteWorkout(w.id)
          }}
        >
          Retirer
        </Button>
      </div>
    </div>
  )
}

function WorkoutCard({ w }: { w: Workout }) {
  const cat = categoryOf(w)
  const [notes, setNotes] = useState(w.notes ?? '')
  const dist = w.run?.distanceM ?? w.cardio?.distanceM
  const km = dist ? (dist >= 1000 || cat === 'course' || cat === 'velo' ? `${(dist / 1000).toFixed(dist % 1000 ? 2 : 0)} km` : `${dist} m`) : null
  return (
    <div className="rounded-2xl bg-white/5 p-3.5 hairline" style={{ borderLeft: `3px solid ${CATEGORY_COLOR[cat]}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.95rem] leading-snug font-medium text-mist-100">{w.title || CATEGORY_LABEL[cat]}</p>
          <p className="text-xs text-mist-500">
            {CATEGORY_LABEL[cat]} · {w.durationMin} min{km ? ` · ${km}` : ''}{w.rpe ? ` · effort ${w.rpe}/10` : ''}{w.run?.shinPain !== undefined ? ` · tibia ${w.run.shinPain}/10` : ''}
          </p>
        </div>
        {!w.program?.length && (
          <button
            aria-label="Supprimer cette séance"
            className="shrink-0 rounded-lg bg-[#ff5a5a]/12 px-2.5 py-1.5 text-xs text-[#ff8f8f]"
            onClick={async () => {
              if (window.confirm('Supprimer cette séance ?')) await deleteWorkout(w.id)
            }}
          >
            Supprimer
          </button>
        )}
      </div>
      {w.sets && w.sets.length > 0 && <p className="mt-1 text-[0.7rem] text-mist-500">{w.sets.length} séries enregistrées</p>}
      <label className="mt-2 block text-[0.7rem] text-mist-500">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes.trim() !== (w.notes ?? '').trim()) void saveWorkout({ ...w, notes: notes.trim() || undefined })
          }}
          rows={2}
          placeholder="Difficulté, séries manquées, ressenti…"
          className="mt-1 w-full resize-y rounded-xl bg-ink-900/70 px-3 py-2.5 text-base text-mist-100 hairline outline-none sm:text-sm"
        />
      </label>
    </div>
  )
}

function AddSheet({ day, onClose }: { day: DayKey; onClose: () => void }) {
  const [type, setType] = useState<ExtraWorkoutInput['type']>('course')
  const [date, setDate] = useState(day)
  const [name, setName] = useState('')
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [rpe, setRpe] = useState(6)
  const [shinBefore, setShinBefore] = useState(0)
  const [shinAfter, setShinAfter] = useState(0)
  const [busy, setBusy] = useState(false)
  const unit = type === 'natation' ? 'mètres' : 'km'
  const hasDistance = type !== 'autre'
  return (
    <Sheet
      open
      onClose={onClose}
      title="Ajouter une séance"
      footer={
        <Button
          variant="primary"
          full
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const w = buildExtraWorkout({ day: date, type, name, distance: Number(distance.replace(',', '.')) || undefined, durationMin: Number(duration) || undefined, notes, rpe: date > todayKey() ? undefined : rpe, ...(type === 'course' && date <= todayKey() ? { shinPainBefore: shinBefore, shinPain: shinAfter } : {}) }, uid('w'), new Date().toISOString())
            await saveWorkout(w)
            onClose()
          }}
        >
          Enregistrer la séance
        </Button>
      }
    >
      <div className="space-y-3.5 pb-2">
        <div className="scroll-x">
          <Segmented value={type} onChange={setType} options={[{ value: 'course', label: 'Course à pied' }, { value: 'natation', label: 'Natation' }, { value: 'velo', label: 'Vélo' }, { value: 'autre', label: 'Autre' }]} />
        </div>
        <Field label="Jour">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Nom de la séance">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'course' ? 'Ex. Footing du matin' : type === 'natation' ? 'Ex. 20 longueurs' : type === 'velo' ? 'Ex. Sortie vélo' : 'Ex. Escalade, boxe…'} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {hasDistance && (
            <Field label={`Distance (${unit})`}>
              <TextInput inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder={type === 'natation' ? '1500' : '8,5'} />
            </Field>
          )}
          <Field label="Durée (min)">
            <TextInput inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" />
          </Field>
        </div>
        {type === 'course' && date <= todayKey() && <ShinCheck label="Avant de partir : douleur au tibia" value={shinBefore} onChange={setShinBefore} advice />}
        {type === 'course' && date <= todayKey() && <ShinCheck label="Après la sortie : douleur au tibia" value={shinAfter} onChange={setShinAfter} />}
        {date <= todayKey() && (
          <Field label="Effort (1 à 10)" group>
            <Stepper value={rpe} onChange={setRpe} min={1} max={10} />
          </Field>
        )}
        <Field label="Notes" optional>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ressenti, météo, allure…" />
        </Field>
      </div>
    </Sheet>
  )
}
