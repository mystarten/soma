import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program, SetEntry } from '../../types'
import { fmtDuration, planTiming, runSets } from '../../engine/runPlan'
import { describeTarget, fmtClock, remainingSec, restAfter, setPosition } from '../../engine/runner'
import { uid } from '../../db/db'
import { Button, Stepper } from '../ui/primitives'
import { saveRunWorkout } from './programActions'
import ExerciseFigure from './ExerciseFigure'

type Phase = 'intro' | 'prep' | 'ready' | 'hold' | 'rest' | 'summary'

/** Nom lisible de l'exercice d'une série : le bloc du programme, sinon l'exercice de la bibliothèque. */
function useNames(program: Program, picks: { code: string; week: number }[]) {
  const data = useSoma()
  return useCallback(
    (s: SetEntry) => {
      const m = /^(.+?)-(\d+)(?:-\w+)?$/.exec(s.block ?? '')
      const session = m ? program.sessions.find((x) => x.code === m[1]) : undefined
      const block = session?.blocks[Number(m?.[2]) - 1]
      const lib = data.exercises.find((e) => e.id === s.exerciseId)?.name
      const raw = block?.name ?? lib ?? 'Exercice'
      void picks
      return raw.replace(/^[A-Z]\.\s*/, '').trim()
    },
    [program.sessions, data.exercises, picks],
  )
}

/**
 * Séance guidée : une série à la fois, avec le repos exact après chacune. L'écran reste allumé
 * (Wake Lock), le chrono se base sur l'heure de fin (il reste juste même si le téléphone a dormi),
 * un bip et une vibration préviennent de la fin du repos.
 */
export default function SessionRunner({
  program,
  picks,
  light,
  onClose,
  onSaved,
}: {
  program: Program
  picks: { code: string; week: number }[]
  light?: boolean
  onClose: () => void
  onSaved: (label: string) => void
}) {
  const nameOf = useNames(program, picks)
  /* Les séries exactement comme elles seront déroulées (unilatéral développé, version légère éventuelle). */
  const plan = useMemo(() => runSets(program, picks, () => uid('set'), { light, nameOf }), [program, picks, light, nameOf])
  const built = plan?.built ?? null
  const expanded = useMemo(() => plan?.sets ?? [], [plan])
  const timing = useMemo(() => planTiming(expanded), [expanded])
  const [phase, setPhase] = useState<Phase>('intro')
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<Record<string, { reps?: number; loadKg?: number }>>({})
  const [endAt, setEndAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [rpe, setRpe] = useState(7)
  const [busy, setBusy] = useState(false)
  const startedAt = useRef<number>(0)
  const ctx = useRef<AudioContext | null>(null)
  const lock = useRef<WakeLockSentinel | null>(null)
  const notified = useRef(false)
  /** Secondes déjà annoncées par un bip pendant ce compte à rebours. */
  const beeped = useRef<Set<number>>(new Set())

  /* ── Écran allumé, son, notifications ── */
  const acquire = useCallback(async () => {
    try {
      lock.current = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      /* non pris en charge */
    }
  }, [])
  useEffect(() => {
    const onVis = () => {
      setNow(Date.now())
      if (document.visibilityState === 'visible' && phase !== 'intro') void acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [phase, acquire])
  useEffect(
    () => () => {
      void lock.current?.release().catch(() => {})
      void ctx.current?.close().catch(() => {})
    },
    [],
  )

  const beep = useCallback((times = 1, freq = 880, dur = 0.18) => {
    const c = ctx.current
    if (!c) return
    /* Sur iPhone le son se suspend après une interruption (appel, écran verrouillé) : on le réveille avant de biper. */
    if (c.state === 'suspended') void c.resume().catch(() => {})
    for (let i = 0; i < times; i++) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.frequency.value = freq
      g.gain.value = 0.25
      o.connect(g)
      g.connect(c.destination)
      const t = c.currentTime + i * 0.28
      o.start(t)
      o.stop(t + dur)
    }
    try {
      navigator.vibrate?.(times > 1 ? [200, 100, 200, 100, 300] : 60)
    } catch {
      /* facultatif */
    }
  }, [])

  const begin = async () => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx.current = new AC()
      /* Un son quasi inaudible en continu garde la page active quand l'écran se verrouille (au mieux). */
      const o = ctx.current.createOscillator()
      const g = ctx.current.createGain()
      g.gain.value = 0.0005
      o.connect(g)
      g.connect(ctx.current.destination)
      o.start()
    } catch {
      /* sans son : le reste fonctionne */
    }
    await acquire()
    startedAt.current = Date.now()
    startPrep()
  }

  /* ── Horloge ── */
  useEffect(() => {
    if (phase !== 'rest' && phase !== 'hold' && phase !== 'prep') return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [phase])

  const sets = expanded
  const cur = sets[idx]
  const left = remainingSec(endAt, now)

  /** Compte à 5 : « prépare-toi ». Utilisé au départ et pour « Recommencer ». */
  function startPrep() {
    notified.current = false
    beeped.current.clear()
    setEndAt(Date.now() + 5000)
    setNow(Date.now())
    setPhase('prep')
  }

  /** La série numéro i démarre : une tenue lance son chrono tout de suite, sinon on l'affiche, prête à être faite. */
  function startSet(i: number) {
    const target = expanded[i]
    notified.current = false
    beeped.current.clear()
    if (target?.holdSec) {
      setEndAt(Date.now() + target.holdSec * 1000)
      setNow(Date.now())
      setPhase('hold')
    } else setPhase('ready')
  }

  const complete = (hold?: boolean) => {
    if (!cur) return
    const next = idx + 1
    if (next >= sets.length) {
      beep(2, 660)
      setPhase('summary')
      return
    }
    const rest = restAfter(sets, idx)
    setIdx(next)
    if (rest > 0) {
      notified.current = false
      beeped.current.clear()
      setEndAt(Date.now() + rest * 1000)
      setNow(Date.now())
      setPhase('rest')
    } else {
      startSet(next)
    }
    void hold
  }

  /* Décompte sonore : un bip à 10 s, puis un bip par seconde pour les 5 dernières, pour se préparer. */
  useEffect(() => {
    if (phase !== 'rest' && phase !== 'hold' && phase !== 'prep') return
    const sec = Math.ceil(left)
    if (sec <= 0 || beeped.current.has(sec)) return
    if (sec === 10 && phase !== 'prep') {
      beeped.current.add(sec)
      beep(1, 660, 0.15)
    } else if (sec >= 1 && sec <= 5) {
      beeped.current.add(sec)
      beep(1, 880, 0.12)
    }
  }, [left, phase, beep])

  /* Fin du repos ou de la tenue. */
  useEffect(() => {
    if ((phase !== 'rest' && phase !== 'hold' && phase !== 'prep') || left > 0 || notified.current) return
    notified.current = true
    if (phase === 'rest' || phase === 'prep') {
      /* Les 5 bips sont passés : la suite démarre toute seule, avec un bip long de départ. */
      beep(1, 1040, 0.4)
      if (phase === 'rest' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const n = sets[idx]
        new Notification('Repos terminé', { body: n ? `${nameOf(n)} · ${describeTarget(n)}` : 'Reprends la séance' })
      }
      startSet(idx)
    } else {
      beep(2, 660)
      complete(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase])

  if (!built || !cur) {
    return (
      <Overlay onClose={onClose}>
        <p className="py-10 text-center text-sm text-mist-300">Cette séance ne contient aucune série à guider.</p>
      </Overlay>
    )
  }

  const pos = setPosition(sets, idx)
  const res = results[cur.id] ?? {}
  const upcoming = sets.slice(idx + 1, idx + 4)
  const doneCount = idx + (phase === 'summary' ? 0 : 0)
  const total = sets.length
  const patch = (p: { reps?: number; loadKg?: number }) => setResults((r) => ({ ...r, [cur.id]: { ...r[cur.id], ...p } }))
  const quit = () => {
    if (phase === 'intro' || window.confirm('Quitter la séance ? Ce qui est fait ne sera pas enregistré.')) onClose()
  }

  const finish = async () => {
    setBusy(true)
    const actual = sets.map((s) => ({ ...s, reps: results[s.id]?.reps ?? s.reps, loadKg: results[s.id]?.loadKg ?? s.loadKg }))
    await saveRunWorkout({
      program,
      picks,
      sets: actual,
      startedAt: new Date(startedAt.current || Date.now()).toISOString(),
      durationMin: Math.round((Date.now() - (startedAt.current || Date.now())) / 60000),
      rpe,
      light,
    })
    onSaved(built.title)
    onClose()
  }

  return (
    <Overlay onClose={quit}>
      {phase !== 'intro' && phase !== 'summary' && (
        <div className="mb-4">
          <div className="mb-1 flex items-baseline justify-between text-xs text-mist-500">
            <span>{built.title}</span>
            <span className="tnum">Série {idx + 1} / {total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / total) * 100}%` }} />
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs tracking-wide text-mist-500 uppercase">Séance guidée</p>
            <h2 className="text-2xl font-semibold text-mist-100">{built.title}</h2>
            <p className="mt-1 text-sm text-mist-300">{total} séries{light ? ' · version légère' : ''}</p>
            <p className="mt-2 text-3xl font-semibold tnum text-accent">⏱ {fmtDuration(timing.totalSec)}</p>
            <p className="text-xs text-mist-500">dont repos {fmtDuration(timing.restSec)}{timing.timedSec ? ` · tenues et durées fixées ${fmtDuration(timing.timedSec)}` : ''}{timing.repsSec ? ` · séries ${fmtDuration(timing.repsSec)} (3 s par répétition)` : ''}</p>
          </div>
          <ul className="max-h-[40vh] space-y-1 overflow-y-auto rounded-xl bg-white/4 p-3 text-sm hairline">
            {Array.from(new Set(sets.map((s) => s.block))).map((b) => {
              const first = sets.find((s) => s.block === b)!
              const n = sets.filter((s) => s.block === b).length
              return (
                <li key={b} className="flex justify-between gap-3">
                  <span className="truncate text-mist-100">{nameOf(first)}</span>
                  <span className="shrink-0 text-mist-500">{n} × {describeTarget(first)}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-mist-500">
            L’écran reste allumé. Après chaque série, le repos se lance tout seul ; 5 bips avant la fin, puis la série suivante démarre automatiquement. Un bouton « Recommencer » te laisse 5 secondes de plus si tu n’es pas prêt. Garde l’appli ouverte : un téléphone verrouillé peut suspendre les alertes.
          </p>
          {'Notification' in window && Notification.permission === 'default' && (
            <Button onClick={() => void Notification.requestPermission()}>Activer les notifications de fin de repos</Button>
          )}
          <Button variant="primary" full onClick={() => void begin()}>Commencer</Button>
        </div>
      )}

      {phase === 'prep' && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <p className="text-xs tracking-wide text-mist-500 uppercase">Prépare-toi · série {pos.n} sur {pos.of}</p>
          <p className="text-[7rem] leading-none font-semibold tnum text-accent">{Math.max(1, Math.ceil(left))}</p>
          <h2 className="text-2xl leading-tight font-semibold text-mist-100">{nameOf(cur)}</h2>
          <p className="text-xl font-semibold tnum text-accent">{describeTarget(cur)}{cur.note ? ` · ${cur.note}` : ''}</p>
          <ExerciseFigure exerciseId={cur.exerciseId} name={nameOf(cur)} />
          <Button onClick={() => { notified.current = true; startSet(idx) }}>Je suis prêt, commencer</Button>
        </div>
      )}

      {phase === 'ready' && (
        <div className="flex flex-col gap-4">
          <ExerciseFigure exerciseId={cur.exerciseId} name={nameOf(cur)} />
          <div className="text-center">
            <p className="text-xs tracking-wide text-mist-500 uppercase">Série {pos.n} sur {pos.of}</p>
            <h2 className="mt-1 text-3xl leading-tight font-semibold text-mist-100">{nameOf(cur)}</h2>
            <p className="mt-2 text-4xl font-semibold tnum text-accent">{describeTarget(cur)}</p>
            {cur.note && <p className="mt-1 text-sm text-mist-300">{cur.note}</p>}
          </div>

          {cur.holdSec ? (
            <Button
              variant="primary"
              full
              onClick={() => {
                notified.current = false
                beeped.current.clear()
                setEndAt(Date.now() + (cur.holdSec ?? 0) * 1000)
                setNow(Date.now())
                setPhase('hold')
              }}
            >
              Démarrer la tenue ({cur.holdSec} s)
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs text-mist-500">Répétitions faites</p>
                  <Stepper value={res.reps ?? cur.reps ?? 0} onChange={(v) => patch({ reps: v })} min={0} max={500} />
                </div>
                {cur.loadKg !== undefined && (
                  <div>
                    <p className="mb-1 text-xs text-mist-500">Charge</p>
                    <Stepper value={res.loadKg ?? cur.loadKg} onChange={(v) => patch({ loadKg: v })} min={-60} max={200} step={0.5} precision={1} suffix="kg" />
                  </div>
                )}
              </div>
              <Button variant="primary" full onClick={() => complete()}>
                Série faite ✓{idx < total - 1 ? ` · repos ${fmtClock(restAfter(sets, idx))}` : ''}
              </Button>
              <Button full onClick={startPrep}>↻ Pas prêt ? Recommencer (5 s)</Button>
            </>
          )}

          {upcoming.length > 0 && (
            <div className="rounded-xl bg-white/4 p-3 text-xs hairline">
              <p className="mb-1 text-mist-500">Ensuite</p>
              <ul className="space-y-0.5">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 text-mist-300">
                    <span className="truncate">{nameOf(s)}</span>
                    <span className="shrink-0">{describeTarget(s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {phase === 'hold' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-xs tracking-wide text-mist-500 uppercase">Tenue en cours</p>
          <h2 className="text-2xl font-semibold text-mist-100">{nameOf(cur)}</h2>
          <p className="text-8xl font-semibold tnum text-accent">{fmtClock(left)}</p>
          {cur.note && <p className="text-sm text-mist-300">{cur.note}</p>}
          <ExerciseFigure exerciseId={cur.exerciseId} name={nameOf(cur)} />
          <div className="flex gap-2">
            <Button onClick={() => { notified.current = true; complete(true) }}>Terminé plus tôt</Button>
            <Button onClick={startPrep}>↻ Recommencer</Button>
          </div>
        </div>
      )}

      {phase === 'rest' && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <p className="text-xs tracking-wide text-mist-500 uppercase">Repos</p>
          <p className="text-[6.5rem] leading-none font-semibold tnum text-accent">{fmtClock(left)}</p>
          <div className="flex gap-2">
            <Button onClick={() => setEndAt((e) => e - 15_000)}>− 15 s</Button>
            <Button onClick={() => { beeped.current.clear(); setEndAt((e) => e + 15_000) }}>+ 15 s</Button>
            <Button variant="primary" onClick={() => { notified.current = true; startSet(idx) }}>Passer</Button>
          </div>
          <div className="mt-3 w-full rounded-xl bg-white/4 p-3 text-left hairline">
            <p className="text-xs text-mist-500">Ensuite · série {setPosition(sets, idx).n} sur {setPosition(sets, idx).of}</p>
            <p className="text-lg font-medium text-mist-100">{nameOf(sets[idx])}</p>
            <p className="text-sm text-accent">{describeTarget(sets[idx])}{sets[idx].note ? ` · ${sets[idx].note}` : ''}</p>
            <div className="mt-2 flex justify-center">
              <ExerciseFigure exerciseId={sets[idx].exerciseId} name={nameOf(sets[idx])} compact />
            </div>
          </div>
          <p className="text-xs text-mist-500">La série suivante démarre toute seule après les 5 bips.</p>
        </div>
      )}

      {phase === 'summary' && (
        <div className="flex flex-col gap-4 text-center">
          <div>
            <p className="text-xs tracking-wide text-mist-500 uppercase">Séance terminée</p>
            <h2 className="text-2xl font-semibold text-mist-100">{built.title}</h2>
            <p className="mt-1 text-sm text-mist-300">{total} séries en {Math.max(1, Math.round((Date.now() - startedAt.current) / 60000))} min</p>
          </div>
          <div className="text-left">
            <p className="mb-1 text-xs text-mist-500">Effort ressenti (1 à 10)</p>
            <Stepper value={rpe} onChange={setRpe} min={1} max={10} />
          </div>
          <Button variant="primary" full disabled={busy} onClick={() => void finish()}>Enregistrer la séance</Button>
        </div>
      )}
    </Overlay>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#03060c] px-4 pt-safe pb-8" role="dialog" aria-modal="true" aria-label="Séance guidée">
      <div className="mx-auto w-full max-w-md">
        <div className="flex justify-end py-3">
          <button onClick={onClose} className="rounded-lg bg-white/8 px-3 py-1.5 text-xs text-mist-300">Quitter</button>
        </div>
        {children}
      </div>
    </div>
  )
}
