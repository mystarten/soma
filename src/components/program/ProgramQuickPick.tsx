import { useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { buildFromProgram, programDone, suggestWeek, type BuiltWorkout, type ProgramPick } from '../../engine/program'
import { applyLight } from '../../engine/coach'
import { uid } from '../../db/db'
import { CoachBanners, ImpactNotice, useImpact } from './advice'

/**
 * Choisir des séances de son programme depuis n'importe quel éditeur de séance :
 * une touche par séance, une touche par semaine, « Ajouter à la séance ».
 */
export default function ProgramQuickPick({ onApply }: { onApply: (b: BuiltWorkout) => void }) {
  const data = useSoma()
  const program = data.program!
  const done = useMemo(() => programDone([...data.workouts, ...data.programMarks]), [data.workouts, data.programMarks])
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [light, setLight] = useState(false)
  const list: ProgramPick[] = Object.entries(picks).map(([code, week]) => ({ code, week }))
  const impact = useImpact(list, program.sessions)

  return (
    <div className="rounded-xl bg-accent/6 p-3 hairline">
      <div className="mb-2 text-[0.68rem] tracking-wider text-mist-500 uppercase">Depuis mon programme</div>
      <div className="flex flex-wrap gap-1.5">
        {program.sessions.map((s) => {
          const sel = picks[s.code] !== undefined
          return (
            <button
              key={s.code}
              onClick={() =>
                setPicks((p) => {
                  const n = { ...p }
                  if (sel) delete n[s.code]
                  else n[s.code] = suggestWeek(s, done.get(s.code), data.today)
                  return n
                })
              }
              aria-pressed={sel}
              title={s.title}
              className="rounded-lg px-3 py-2 text-sm transition active:scale-95"
              style={{ background: sel ? 'var(--accent)' : '#ffffff0f', color: sel ? '#04070d' : '#eaf2ff', fontWeight: sel ? 600 : 400 }}
            >
              {s.code}
              <span className="ml-1.5 hidden text-[0.68rem] opacity-70 sm:inline">{s.title.split(' ').slice(0, 2).join(' ')}</span>
            </button>
          )
        })}
      </div>
      {list.map((p) => {
        const s = program.sessions.find((x) => x.code === p.code)!
        return (
          <div key={p.code} className="mt-2">
            <div className="mb-1 text-[0.68rem] text-mist-500">
              {s.code} · {s.title}
            </div>
            <div className="scroll-x flex gap-1" role="group" aria-label={`Semaine de ${s.code}`}>
              {s.weeks.map((w) => (
                <button
                  key={w.n}
                  onClick={() => setPicks((x) => ({ ...x, [s.code]: w.n }))}
                  aria-pressed={picks[s.code] === w.n}
                  title={`${w.label}${w.light ? ' · légère' : ''}${w.test ? ' · test' : ''}`}
                  className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg text-xs tnum"
                  style={{
                    background: picks[s.code] === w.n ? 'var(--accent)' : w.test ? '#2e75b633' : w.light ? '#ffc24b22' : '#ffffff0d',
                    color: picks[s.code] === w.n ? '#04070d' : done.get(s.code)?.has(w.n) ? 'var(--accent)' : '#b9c6dc',
                  }}
                >
                  {done.get(s.code)?.has(w.n) && picks[s.code] !== w.n ? '✓' : w.n}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      {list.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <CoachBanners light={light} onLight={setLight} />
          <ImpactNotice impact={impact} />
          <button
            onClick={() => {
              const built = buildFromProgram(program, list, () => uid('set'))
              if (!built) return
              onApply(light ? { ...built, sets: applyLight(built.sets), title: `${built.title} (légère)` } : built)
              setPicks({})
            }}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-ink-950"
          >
            Ajouter à la séance : {list.map((p) => `${p.code} · S${p.week}`).join(' + ')}
          </button>
        </div>
      )}
    </div>
  )
}
