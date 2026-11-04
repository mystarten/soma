import type { ExerciseDef, SetEntry } from '../types'

/* Résumé lisible d'un exercice : « 3 × 8 = 24 reps · +10 kg · repos 90 s ». */

export interface SetSummary {
  sets: number
  totalReps: number
  totalHoldSec: number
  line: string
}

const fmtSec = (s: number) => {
  const v = Math.round(s)
  if (v < 60) return `${v} s`
  const m = Math.floor(v / 60)
  const r = v % 60
  return r ? `${m} min ${String(r).padStart(2, '0')} s` : `${m} min`
}

const fmtKg = (n: number) => `${Math.round(n * 10) / 10}`

const allEqual = (xs: number[]) => xs.every((x) => x === xs[0])

export function summarizeSets(ex: ExerciseDef | undefined, sets: SetEntry[]): SetSummary {
  const n = sets.length
  const isStatic = ex?.kind === 'static'
  const parts: string[] = []
  let totalReps = 0
  let totalHoldSec = 0

  if (isStatic) {
    const holds = sets.map((s) => s.holdSec ?? 0)
    totalHoldSec = holds.reduce((a, b) => a + b, 0)
    const label = allEqual(holds) ? `${n} × ${fmtSec(holds[0] ?? 0)}` : `${holds.map((h) => `${h}`).join(' + ')} s`
    parts.push(n > 1 ? `${label} = ${fmtSec(totalHoldSec)}` : label)
  } else {
    const reps = sets.map((s) => s.reps ?? 0)
    totalReps = reps.reduce((a, b) => a + b, 0)
    const label = allEqual(reps) ? `${n} × ${reps[0] ?? 0}` : reps.join(' + ')
    parts.push(n > 1 ? `${label} = ${totalReps} reps` : `${totalReps} reps`)
    const loads = sets.map((s) => s.loadKg ?? 0).filter((l) => l !== 0)
    if (loads.length) {
      const min = Math.min(...loads)
      const max = Math.max(...loads)
      parts.push(min === max ? `${max > 0 ? '+' : ''}${fmtKg(max)} kg` : `${fmtKg(min)} → ${fmtKg(max)} kg`)
    }
  }

  const rests = sets.map((s) => s.restSec).filter((r): r is number => typeof r === 'number' && r > 0)
  if (rests.length) {
    const avg = Math.round(rests.reduce((a, b) => a + b, 0) / rests.length)
    parts.push(`repos ${fmtSec(avg)}`)
  }
  return { sets: n, totalReps, totalHoldSec, line: parts.join(' · ') }
}

/** Regroupe les séries d'une séance par exercice, dans l'ordre d'apparition. */
export function groupByExercise(sets: SetEntry[]): { exerciseId: string; sets: SetEntry[] }[] {
  const out: { exerciseId: string; sets: SetEntry[] }[] = []
  for (const s of sets) {
    const g = out.find((x) => x.exerciseId === s.exerciseId)
    if (g) g.sets.push(s)
    else out.push({ exerciseId: s.exerciseId, sets: [s] })
  }
  return out
}
