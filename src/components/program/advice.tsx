import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { ExerciseDef, ProgramSession } from '../../types'
import { matchExercise, type ProgramPick } from '../../engine/program'
import { SEVERITY_ADVICE, SEVERITY_LABEL, lightWeekAdvice, loadAlert, sessionImpact } from '../../engine/coach'
import { ZONE_LABEL, JOINT_LABEL } from '../../engine/fatigueConfig'
import type { Joint, MuscleZone } from '../../types'

/** Les exercices (de la bibliothèque) qu'une séance du programme fait travailler. */
export function sessionExercises(session: ProgramSession, library: ExerciseDef[]): ExerciseDef[] {
  const out: ExerciseDef[] = []
  for (const b of session.blocks) {
    if (/^tours?$/i.test(b.name)) continue
    const id = matchExercise(b.name, session.title).id
    const ex = library.find((e) => e.id === id)
    if (ex) out.push(ex)
  }
  return out
}

export const areaLabel = (a: string) => JOINT_LABEL[a as Joint] ?? ZONE_LABEL[a as MuscleZone] ?? a

const TONE = { high: '#ffb02e', watch: '#ffc24b', low: '#9fb6d6', ok: '#41e08a' } as const

/** Alerte de charge + conseil de semaine légère, en deux phrases calmes. */
export function CoachBanners({ light, onLight }: { light?: boolean; onLight?: (v: boolean) => void }) {
  const data = useSoma()
  const alert = loadAlert(data.balance)
  const lw = lightWeekAdvice(data.checkins, data.today)
  const showAlert = alert && alert.level !== 'ok'
  if (!showAlert && !lw.active) return null
  return (
    <div className="flex flex-col gap-2">
      {showAlert && alert && (
        <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: `${TONE[alert.level]}14`, boxShadow: `inset 0 0 0 1px ${TONE[alert.level]}40` }}>
          <span className="font-medium" style={{ color: TONE[alert.level] }}>{alert.title} · </span>
          <span className="text-mist-300">{alert.text}</span>
        </div>
      )}
      {lw.active && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-xs hairline">
          <span className="text-mist-300">
            <span className="font-medium text-[#ffc24b]">Semaine légère conseillée · </span>
            récupération moyenne {Math.round(lw.avg)} % depuis 3 jours : un tiers de séries en moins, même charge.
          </span>
          {onLight && (
            <button
              onClick={() => onLight(!light)}
              aria-pressed={light}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition"
              style={{ background: light ? 'var(--accent)' : '#ffffff10', color: light ? '#04070d' : '#b9c6dc' }}
            >
              {light ? 'Version légère ✓' : 'Version légère'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Avertissements douleur pour des séances choisies. */
export function useImpact(picks: ProgramPick[], sessions: ProgramSession[]) {
  const data = useSoma()
  return useMemo(() => {
    const exs = picks.flatMap((p) => {
      const s = sessions.find((x) => x.code === p.code)
      return s ? sessionExercises(s, data.exercises) : []
    })
    return sessionImpact(exs, data.injuries)
  }, [picks, sessions, data.exercises, data.injuries])
}

export function ImpactNotice({ impact }: { impact: ReturnType<typeof useImpact> }) {
  if (!impact.length) return null
  return (
    <div className="rounded-xl bg-[#ffb02e14] px-3 py-2.5 text-xs" style={{ boxShadow: 'inset 0 0 0 1px #ffb02e40' }}>
      {impact.map((w) => (
        <p key={w.area} className="text-mist-300">
          <span className="font-medium text-[#ffb02e]">{areaLabel(w.area)} ({SEVERITY_LABEL[w.severity]}) · </span>
          concerne {w.exercises.join(', ')}. {SEVERITY_ADVICE[w.severity]}
        </p>
      ))}
    </div>
  )
}
