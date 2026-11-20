import { useCallback, useEffect, useRef, useState } from 'react'
import { fmtClock } from '../../engine/runner'
import { phasesMinutes, shinAdvice, type RunPhase } from '../../engine/run'
import { Button, Sheet, Stepper } from '../ui/primitives'

/** Douleur au tibia (0 à 10), avec un conseil au-dessus de 3. Jamais bloquant. */
export function ShinCheck({ label, value, onChange, advice }: { label: string; value: number; onChange: (v: number) => void; advice?: boolean }) {
  const text = advice ? shinAdvice(value) : null
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-mist-300">{label}</p>
      <Stepper value={value} onChange={onChange} min={0} max={10} suffix="/10" />
      {text && (
        <p role="alert" className="rounded-xl bg-[#ffc24b]/12 px-3 py-2.5 text-sm text-[#ffd98a]">
          {text}
        </p>
      )}
    </div>
  )
}

function useBeep() {
  const ctx = useRef<AudioContext | null>(null)
  return useCallback((times = 1, freq = 880) => {
    try {
      navigator.vibrate?.(times > 1 ? [200, 100, 200] : 80)
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx.current ??= new AC()
      const c = ctx.current
      for (let i = 0; i < times; i++) {
        const o = c.createOscillator()
        const g = c.createGain()
        o.frequency.value = freq
        g.gain.value = 0.2
        o.connect(g)
        g.connect(c.destination)
        const t = c.currentTime + i * 0.28
        o.start(t)
        o.stop(t + 0.18)
      }
    } catch {
      /* pas de son : le chrono reste utilisable */
    }
  }, [])
}

/** Chrono d'intervalles pour la course : trot, marche… un bip à chaque changement de phase. */
export function IntervalTimer({ phases, onClose }: { phases: RunPhase[]; onClose: () => void }) {
  const beep = useBeep()
  const [idx, setIdx] = useState(0)
  const [left, setLeft] = useState(phases[0]?.sec ?? 0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const endRef = useRef(0)

  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => {
      const l = Math.ceil((endRef.current - Date.now()) / 1000)
      if (l > 0) return setLeft(l)
      if (idx + 1 >= phases.length) {
        setRunning(false)
        setFinished(true)
        setLeft(0)
        beep(3, 660)
        return
      }
      const n = idx + 1
      endRef.current = Date.now() + phases[n].sec * 1000
      setIdx(n)
      setLeft(phases[n].sec)
      beep(2, /marche/i.test(phases[n].label) ? 660 : 880)
    }, 250)
    return () => window.clearInterval(t)
  }, [running, idx, phases, beep])

  const start = () => {
    endRef.current = Date.now() + left * 1000
    setRunning(true)
    beep(1)
  }
  const restart = () => {
    setRunning(false)
    setFinished(false)
    setIdx(0)
    setLeft(phases[0]?.sec ?? 0)
  }
  const cur = phases[idx]
  const next = phases[idx + 1]
  const remaining = phases.slice(idx + 1).reduce((a, p) => a + p.sec, 0) + left
  const walk = /marche|récup/i.test(cur?.label ?? '')

  return (
    <Sheet
      open
      onClose={onClose}
      title="Chrono d’intervalles"
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          {finished ? (
            <Button variant="primary" onClick={onClose}>Terminé ✓</Button>
          ) : running ? (
            <Button variant="primary" onClick={() => setRunning(false)}>Pause</Button>
          ) : (
            <Button variant="primary" onClick={start}>{idx === 0 && left === cur?.sec ? '▶ Démarrer' : '▶ Reprendre'}</Button>
          )}
          <Button onClick={restart}>Recommencer</Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2 text-center">
        <p className="text-xs text-mist-500">
          Phase {Math.min(idx + 1, phases.length)} sur {phases.length} · {phasesMinutes(phases)} min au total
        </p>
        <p className="text-3xl font-semibold" style={{ color: finished ? '#41e08a' : walk ? '#6bb7ff' : '#35e3ff' }}>{finished ? 'Bravo !' : cur?.label}</p>
        <p className="text-7xl font-semibold tnum text-mist-100" aria-live="off">{fmtClock(left)}</p>
        <p className="text-sm text-mist-300">{finished ? 'Séance terminée.' : next ? `Ensuite : ${next.label} ${Math.round(next.sec / 60 * 10) / 10} min` : 'Dernière phase'}</p>
        {!finished && <p className="text-xs text-mist-500">Reste {fmtClock(remaining)} en tout</p>}
        <p className="text-[0.68rem] text-mist-700">Garde l’écran allumé : un bip signale chaque changement.</p>
      </div>
    </Sheet>
  )
}
