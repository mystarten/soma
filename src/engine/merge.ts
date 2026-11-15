import type { Workout } from '../types'
import { socleOf } from './rotation'

export interface MergePlan {
  keep: Workout
  drop: Workout
}

const isStreetProgram = (w: Workout) => w.source !== 'whoop' && (w.program ?? []).some((r) => socleOf(r.code) === 'street')
const isWhoopStreet = (w: Workout) => w.source === 'whoop' && w.kind === 'street' && !(w.program ?? []).length

/**
 * Une séance de street cochée dans le programme et la même séance enregistrée par la montre
 * (« gymnastics ») ne font qu'une : on garde les mesures de la montre et le détail du programme.
 */
export function planMerges(all: Workout[]): MergePlan[] {
  const live = all.filter((w) => !w.deleted && !w.backfill && !w.planned)
  const byDay = new Map<string, Workout[]>()
  for (const w of live) byDay.set(w.day, [...(byDay.get(w.day) ?? []), w])
  const out: MergePlan[] = []
  for (const list of byDay.values()) {
    const progs = list.filter(isStreetProgram).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    const whoops = list.filter(isWhoopStreet).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    for (let i = 0; i < Math.min(progs.length, whoops.length); i++) {
      const p = progs[i]
      const w = whoops[i]
      out.push({
        drop: p,
        keep: {
          ...w,
          title: p.title ?? w.title,
          program: p.program,
          sets: p.sets,
          rpe: p.rpe ?? w.rpe,
          feeling: p.feeling ?? w.feeling,
          notes: p.notes ?? w.notes,
        },
      })
    }
  }
  return out
}
