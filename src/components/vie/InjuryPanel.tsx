import { useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Injury, Joint, MuscleZone } from '../../types'
import { JOINTS, MUSCLE_ZONES } from '../../types'
import { JOINT_LABEL, ZONE_LABEL } from '../../engine/fatigueConfig'
import { SEVERITY_ADVICE, SEVERITY_LABEL } from '../../engine/coach'
import { deleteInjury, saveInjury } from '../../db/repo'
import { uid } from '../../db/db'
import { Button, Card, Select, TextInput } from '../ui/primitives'

const AREAS = [
  ...JOINTS.map((j) => ({ value: j as string, label: JOINT_LABEL[j] })),
  ...MUSCLE_ZONES.map((z) => ({ value: z as string, label: ZONE_LABEL[z] })),
]
const COLORS = { 1: '#ffc24b', 2: '#ff8f45', 3: '#ff6a4b' } as const
const label = (a: string) => JOINT_LABEL[a as Joint] ?? ZONE_LABEL[a as MuscleZone] ?? a

/** Douleurs et blessures : une ligne par zone. Elles pèsent sur les séances proposées. */
export default function InjuryPanel() {
  const data = useSoma()
  const [area, setArea] = useState<string>('genoux')
  const [severity, setSeverity] = useState<1 | 2 | 3>(1)
  const [note, setNote] = useState('')
  const active = data.injuries.filter((i) => i.active).sort((a, b) => b.severity - a.severity)
  const healed = data.injuries.filter((i) => !i.active).sort((a, b) => b.since.localeCompare(a.since)).slice(0, 3)

  const add = async () => {
    const row: Injury = {
      id: uid('inj'),
      area: area as Injury['area'],
      severity,
      note: note.trim() || undefined,
      since: data.today,
      active: true,
      updatedAt: new Date().toISOString(),
    }
    setNote('')
    await saveInjury(row)
  }

  return (
    <Card title="Douleurs & blessures" subtitle={active.length ? `${active.length} en cours` : 'Rien à signaler'}>
      {active.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {active.map((i) => (
            <li key={i.id} className="rounded-xl bg-white/4 px-3 py-2 hairline">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i.severity] }} />
                <span className="min-w-0 flex-1 truncate text-sm text-mist-100">
                  {label(i.area)} · <span className="text-mist-300">{SEVERITY_LABEL[i.severity]}</span>
                </span>
                <button className="shrink-0 text-xs text-accent" onClick={() => void saveInjury({ ...i, active: false })}>
                  Guérie
                </button>
                <button className="shrink-0 text-xs text-mist-700" onClick={() => void deleteInjury(i.id)} aria-label="Supprimer">
                  ✕
                </button>
              </div>
              <p className="mt-0.5 pl-4 text-[0.68rem] text-mist-500">
                {i.note ? `${i.note} · ` : ''}
                {SEVERITY_ADVICE[i.severity]}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select value={area} onChange={setArea} options={AREAS} />
        <div className="flex gap-1" role="radiogroup" aria-label="Gravité">
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={severity === s}
              onClick={() => setSeverity(s)}
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: severity === s ? `${COLORS[s]}33` : '#ffffff0d', color: severity === s ? COLORS[s] : '#b9c6dc', boxShadow: severity === s ? `inset 0 0 0 1px ${COLORS[s]}` : undefined }}
            >
              {s === 1 ? 'Gêne' : s === 2 ? 'Douleur' : 'Forte'}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Précision (facultatif) : tire en descente…" aria-label="Précision" />
        <Button variant="primary" onClick={() => void add()}>
          Ajouter
        </Button>
      </div>
      {healed.length > 0 && (
        <p className="mt-2 text-[0.66rem] text-mist-700">Guéries récemment : {healed.map((i) => label(i.area)).join(', ')}</p>
      )}
    </Card>
  )
}
