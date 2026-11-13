import { useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { navigate } from '../../lib/router'
import { useRotation } from '../program/useRotation'
import TickSheet from '../program/TickSheet'
import { WeekNote } from '../program/weekNote'
import { useToast } from '../ui/primitives'

/** Les séances dont c'est le tour, par socle, avec la coche rapide. Se range d'elle-même quand tout est fait. */
export default function NextSessions() {
  const data = useSoma()
  const { rotation } = useRotation()
  const toast = useToast()
  const [tick, setTick] = useState<{ code: string; week: number } | null>(null)
  if (!data.program) return null
  const groups = rotation.filter((r) => r.available.length)
  if (!groups.length) return null

  return (
    <section aria-label="Prochaines séances" className="glass rounded-[var(--radius-card)] p-4">
      {toast.node}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-medium text-mist-100">Prochaines séances</h3>
        <button onClick={() => navigate('seances')} className="text-xs text-accent">
          Programme →
        </button>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.socle}>
            <div className="mb-1 text-[0.62rem] tracking-wider text-mist-500 uppercase">{g.label}</div>
            <ul className="space-y-1">
              {g.available.map((it) => (
                <li key={it.code} className="flex items-center gap-2">
                  <span className="w-8 shrink-0 text-xs font-semibold text-accent tnum">{it.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-mist-100">{it.title}</span>
                    <span className="block text-[0.64rem] text-mist-500">
                      S{it.nextWeek} <WeekNote week={it.week} />
                    </span>
                  </span>
                  <button
                    onClick={() => setTick({ code: it.code, week: it.nextWeek! })}
                    aria-label={`Marquer ${it.code} semaine ${it.nextWeek} comme faite`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/6 text-mist-300 transition active:scale-95 hover:bg-accent/20 hover:text-accent"
                  >
                    <svg viewBox="0 0 20 20" className="h-4 w-4">
                      <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {tick && data.program && (
        <TickSheet
          program={data.program}
          code={tick.code}
          week={tick.week}
          onClose={() => setTick(null)}
          onDone={(label) => toast.show(`${label} faite ✓`)}
          onDetail={() => navigate('seances')}
        />
      )}
    </section>
  )
}
