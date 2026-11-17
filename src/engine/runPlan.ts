import type { Program, SetEntry } from '../types'
import { buildFromProgram, type BuiltWorkout } from './program'
import { applyLight } from './coach'
import { expandSides, restAfter } from './runner'

/** Nom du bloc du programme d'où vient une série (« A. Lestées +25 kg » → « Lestées +25 kg »). */
export function blockName(program: Pick<Program, 'sessions'>, s: Pick<SetEntry, 'block'>): string | undefined {
  const m = /^(.+?)-(\d+)(?:-\w+)?$/.exec(s.block ?? '')
  const session = m ? program.sessions.find((x) => x.code === m[1]) : undefined
  const name = session?.blocks[Number(m?.[2]) - 1]?.name
  return name?.replace(/^[A-Z]\.\s*/, '').trim()
}

/** Les séries exactement comme la séance guidée les déroulera (unilatéral développé, version légère éventuelle). */
export function runSets(
  program: Program,
  picks: { code: string; week: number }[],
  makeId: () => string,
  opts: { light?: boolean; nameOf?: (s: SetEntry) => string } = {},
): { built: BuiltWorkout; sets: SetEntry[] } | null {
  const built = buildFromProgram(program, picks, makeId)
  if (!built) return null
  const base = opts.light ? applyLight(built.sets) : built.sets
  const nameOf = opts.nameOf ?? ((s: SetEntry) => blockName(program, s) ?? '')
  return { built, sets: expandSides(base, nameOf) }
}

export const SEC_PER_REP = 3
/** Temps de mise en place entre deux séries (se placer, reprendre la barre). */
export const SETUP_SEC = 5

export interface Timing {
  totalSec: number
  restSec: number
  /** Tenues et séries de durée connue (EMOM, rameur…). */
  timedSec: number
  /** Séries de répétitions : répétitions × durée par répétition + mise en place. */
  repsSec: number
  sets: number
}

/**
 * Durée de la séance : les repos et les tenues sont exacts, les durées données par le programme (EMOM, rameur)
 * aussi ; seules les séries de répétitions sont estimées (3 s par répétition + 5 s de mise en place).
 */
export function planTiming(sets: Pick<SetEntry, 'reps' | 'holdSec' | 'workSec' | 'restSec'>[], secPerRep = SEC_PER_REP): Timing {
  let rest = 0
  let timed = 0
  let repsT = 0
  sets.forEach((s, i) => {
    rest += restAfter(sets, i)
    if (s.holdSec) timed += s.holdSec
    else if (s.workSec) timed += s.workSec
    else if (s.reps) repsT += s.reps * secPerRep + SETUP_SEC
  })
  return { totalSec: rest + timed + repsT, restSec: rest, timedSec: timed, repsSec: repsT, sets: sets.length }
}

/** « 1 h 08 », « 42 min ». */
export function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

/** Durée prévue d'une séance du programme, semaine donnée. */
export function sessionTiming(program: Program, code: string, week: number, light = false): Timing | null {
  const r = runSets(program, [{ code, week }], () => 'x', { light })
  return r ? planTiming(r.sets) : null
}
