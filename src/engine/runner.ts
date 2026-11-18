import type { EmomSpec, SetEntry } from '../types'

export const DEFAULT_REST_SEC = 90

/** « 8 reps · +20 kg », « Tenue 40 s », « 400 m ». */
export function describeTarget(s: Pick<SetEntry, 'reps' | 'loadKg' | 'holdSec' | 'distanceM'> & { emom?: EmomSpec }): string {
  const bits: string[] = []
  if (s.emom) bits.push(`EMOM ${s.emom.minutes} min`)
  else if (s.holdSec) bits.push(`Tenue ${s.holdSec} s`)
  else if (s.reps) bits.push(`${s.reps} rep${s.reps > 1 ? 's' : ''}`)
  else if (s.distanceM) bits.push(`${s.distanceM} m`)
  if (s.loadKg) bits.push(`${s.loadKg > 0 ? '+' : ''}${s.loadKg} kg`)
  return bits.join(' · ') || 'Libre'
}

/** Repos à prendre après la série i (aucun après la dernière). */
export function restAfter(sets: Pick<SetEntry, 'restSec'>[], i: number): number {
  if (i >= sets.length - 1) return 0
  return Math.max(0, sets[i].restSec ?? DEFAULT_REST_SEC)
}

export const fmtClock = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Temps restant jusqu'à un instant absolu : reste exact même si l'écran s'est mis en veille entre-temps. */
export const remainingSec = (endAt: number, now: number): number => Math.max(0, (endAt - now) / 1000)

/** Numéro de série dans son bloc : « 3 / 4 ». */
export function setPosition(sets: Pick<SetEntry, 'block'>[], i: number): { n: number; of: number } {
  const key = sets[i]?.block
  const same = sets.map((s, j) => ({ s, j })).filter((x) => x.s.block === key)
  return { n: same.findIndex((x) => x.j === i) + 1, of: same.length }
}

/* Exercices unilatéraux : une série « 30 s » se fait sur chaque côté, donc 2 fois plus de passages. */
const UNILATERAL = [
  /planche (laterale|latérale)|gainage (laterale|latéral)/i,
  /unilat/i,
  /\bun(e)? (seul(e)? )?(bras|jambe|main|pied|côté|cote)\b/i,
  /à une (main|jambe)|a une (main|jambe)/i,
  /\b(pistol|bulgare|bulgarian|sissy|single.leg|single.arm|copenhagen)\b/i,
  /\bpar côté\b|\bpar cote\b|\bchaque côté\b|\bchaque cote\b/i,
]

export function isUnilateralName(name: string): boolean {
  return UNILATERAL.some((re) => re.test(name))
}

/**
 * Développe les séries unilatérales en une série par côté : « 3 × 30 s » devient 6 passages
 * (gauche, droite, gauche, droite…), pour que le chrono et le compte soient justes.
 */
export function expandSides<T extends { id: string; note?: string }>(sets: T[], nameOf: (s: T) => string): T[] {
  const out: T[] = []
  for (const s of sets) {
    if (!isUnilateralName(nameOf(s))) {
      out.push(s)
      continue
    }
    out.push({ ...s, id: `${s.id}-g`, note: joinNote(s.note, 'côté gauche') })
    out.push({ ...s, id: `${s.id}-d`, note: joinNote(s.note, 'côté droit') })
  }
  return out
}

const joinNote = (a: string | undefined, b: string) => (a ? `${a} · ${b}` : b)
