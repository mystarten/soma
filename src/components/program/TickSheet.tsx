import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { Button, Field, Sheet, Stepper, TextInput } from '../ui/primitives'
import { tickSession } from './programActions'
import { WeekNote } from './weekNote'

/** Confirmer une séance faite : jour, heure, effort. Les séries prévues sont enregistrées comme faites. */
export default function TickSheet({
  program,
  code,
  week,
  light,
  onClose,
  onDone,
}: {
  program: Program
  code: string
  week: number
  light?: boolean
  onClose: () => void
  onDone: (label: string) => void
}) {
  const data = useSoma()
  const session = program.sessions.find((s) => s.code === code)
  const w = session?.weeks.find((x) => x.n === week)
  const duration = session?.durationMin ?? 45
  const defaultTime = useMemo(() => {
    const d = new Date(Date.now() - duration * 60_000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }, [duration])
  const [day, setDay] = useState(data.today)
  const [time, setTime] = useState(defaultTime)
  const [rpe, setRpe] = useState(7)
  const [busy, setBusy] = useState(false)
  if (!session || !w) return null

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${code} · semaine ${week}`}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            full
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await tickSession({ program, code, week, day, time, rpe, light })
              onDone(`${code} · S${week}`)
              onClose()
            }}
          >
            Séance faite ✓
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <p className="text-sm text-mist-100">
          {session.title} <WeekNote week={w} />
        </p>
        <p className="text-xs text-mist-500">
          Les séries prévues sont enregistrées comme faites. Elles alimentent ta fatigue musculaire, le petit bonhomme et ta récupération.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jour">
            <TextInput type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Heure de début" hint="Elle pilote la récupération.">
            <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Effort ressenti (1 à 10)">
          <Stepper value={rpe} onChange={setRpe} min={1} max={10} />
        </Field>
      </div>
    </Sheet>
  )
}
