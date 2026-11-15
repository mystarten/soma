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

const FRAGMENT_GAP_MIN = 60
const groupKey = (w: Workout) => `${w.kind}|${w.cardio?.modality ?? ''}`

/**
 * La montre découpe parfois une séance en plusieurs activités (échauffement, séries…).
 * Deux activités de la montre du même type, à moins d'une heure d'écart, ne font qu'une séance.
 */
export function planFragments(all: Workout[]): { keep: Workout; drop: Workout[] }[] {
  const whoop = all.filter((w) => !w.deleted && !w.backfill && !w.planned && w.source === 'whoop')
  const byKey = new Map<string, Workout[]>()
  for (const w of whoop) byKey.set(`${w.day}|${groupKey(w)}`, [...(byKey.get(`${w.day}|${groupKey(w)}`) ?? []), w])
  const out: { keep: Workout; drop: Workout[] }[] = []
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    let cluster: Workout[] = []
    let clusterEnd = 0
    const flush = () => {
      if (cluster.length > 1) out.push({ keep: combine(cluster), drop: cluster.slice(1) })
      cluster = []
    }
    for (const w of sorted) {
      const start = new Date(w.startedAt).getTime()
      if (cluster.length && start - clusterEnd > FRAGMENT_GAP_MIN * 60_000) flush()
      cluster.push(w)
      clusterEnd = Math.max(clusterEnd, start + w.durationMin * 60_000)
    }
    flush()
  }
  return out
}

function combine(ws: Workout[]): Workout {
  const first = ws[0]
  const total = ws.reduce((a, w) => a + w.durationMin, 0)
  const hrs = ws.filter((w) => w.avgHr)
  const zones = ws.some((w) => w.hrZoneMinutes)
    ? ([0, 1, 2, 3, 4].map((i) => ws.reduce((a, w) => a + (w.hrZoneMinutes?.[i] ?? 0), 0)) as Workout['hrZoneMinutes'])
    : undefined
  return {
    ...first,
    durationMin: total,
    avgHr: hrs.length ? Math.round(hrs.reduce((a, w) => a + (w.avgHr ?? 0) * w.durationMin, 0) / Math.max(1, hrs.reduce((a, w) => a + w.durationMin, 0))) : undefined,
    maxHr: Math.max(0, ...ws.map((w) => w.maxHr ?? 0)) || undefined,
    whoopStrain: ws.some((w) => w.whoopStrain !== undefined) ? Math.max(...ws.map((w) => w.whoopStrain ?? 0)) : undefined,
    hrZoneMinutes: zones,
  }
}
