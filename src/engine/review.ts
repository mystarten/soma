import type { CheckIn, DayKey, Task, Workout } from '../types'
import { addDayKey, dayRange, weekBounds } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Boucle de revue : chaque semaine, quelques chiffres, ce qui a changé, une
   question, et trois lignes écrites par toi. Règles simples, sans IA, ton calme.
   ────────────────────────────────────────────────────────────────────────── */

export interface WeekStats {
  start: DayKey
  end: DayKey
  sessions: number
  minutes: number
  /** Séances du programme couvertes cette semaine-là. */
  programSessions: number
  avgRecovery: number | null
  avgSleepH: number | null
  checkins: number
  tasksDone: number
  tasksLate: number
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function weekStats(
  start: DayKey,
  src: { workouts: Workout[]; checkins: CheckIn[]; tasks: Task[] },
): WeekStats {
  const end = addDayKey(start, 6)
  const days = new Set(dayRange(start, end))
  const ws = src.workouts.filter((w) => !w.deleted && !w.planned && days.has(w.day))
  const cs = src.checkins.filter((c) => !c.deleted && days.has(c.day))
  const doneTasks = src.tasks.filter(
    (t) => !t.deleted && t.status === 'fait' && t.completedAt && days.has(t.completedAt.slice(0, 10)),
  )
  const late = src.tasks.filter((t) => !t.deleted && t.status !== 'fait' && t.due && t.due <= end)
  return {
    start,
    end,
    sessions: ws.length,
    minutes: ws.reduce((a, w) => a + (w.durationMin || 0), 0),
    programSessions: ws.reduce((a, w) => a + (w.program?.length ?? 0), 0),
    avgRecovery: avg(cs.map((c) => c.recovery).filter((v): v is number => typeof v === 'number')),
    avgSleepH: avg(cs.map((c) => c.sleep?.hours).filter((v): v is number => typeof v === 'number')),
    checkins: cs.length,
    tasksDone: doneTasks.length,
    tasksLate: late.length,
  }
}

/** La semaine à revoir : la semaine en cours le week-end, sinon la précédente. */
export function reviewWeekFor(today: DayKey, weekStartsOn: 0 | 1 = 1): { start: DayKey; end: DayKey; current: boolean } {
  const cur = weekBounds(today, weekStartsOn)
  const weekend = today >= addDayKey(cur.end, -1)
  if (weekend) return { ...cur, current: true }
  const start = addDayKey(cur.start, -7)
  return { start, end: addDayKey(start, 6), current: false }
}

export function reviewDone(r: { wentWell?: string; heavy?: string; nextFocus?: string; answer?: string } | undefined): boolean {
  return !!r && [r.wentWell, r.heavy, r.nextFocus, r.answer].some((t) => !!t?.trim())
}

const fmtH = (h: number) => {
  const m = Math.round(h * 60)
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** Ce qui a changé, en phrases courtes (4 au plus). Jamais de reproche. */
export function insights(cur: WeekStats, prev: WeekStats | null, sleepGoalH: number): string[] {
  const out: string[] = []
  if (cur.sessions > 0) {
    const d = prev ? cur.sessions - prev.sessions : 0
    out.push(
      `${cur.sessions} séance${cur.sessions > 1 ? 's' : ''} (${Math.round(cur.minutes)} min)` +
        (prev && d !== 0 ? ` · ${d > 0 ? '+' : '−'}${Math.abs(d)} par rapport à la semaine d’avant` : ''),
    )
  } else out.push('Pas de séance cette semaine : une semaine de repos, ça compte aussi.')
  if (cur.avgSleepH !== null) {
    const diff = prev?.avgSleepH != null ? cur.avgSleepH - prev.avgSleepH : null
    out.push(
      `Sommeil moyen ${fmtH(cur.avgSleepH)}` +
        (cur.avgSleepH < sleepGoalH - 0.75 ? ` (objectif ${fmtH(sleepGoalH)})` : '') +
        (diff !== null && Math.abs(diff) >= 0.25 ? ` · ${diff > 0 ? '+' : '−'}${fmtH(Math.abs(diff))} vs semaine passée` : ''),
    )
  }
  if (cur.avgRecovery !== null) {
    const diff = prev?.avgRecovery != null ? cur.avgRecovery - prev.avgRecovery : null
    out.push(
      `Récupération moyenne ${Math.round(cur.avgRecovery)} %` +
        (diff !== null && Math.abs(diff) >= 4 ? ` · ${diff > 0 ? '+' : '−'}${Math.round(Math.abs(diff))} points` : ''),
    )
  }
  if (cur.tasksDone > 0 || cur.tasksLate > 0) {
    out.push(
      `${cur.tasksDone} tâche${cur.tasksDone > 1 ? 's' : ''} faite${cur.tasksDone > 1 ? 's' : ''}` +
        (cur.tasksLate ? ` · ${cur.tasksLate} encore ouverte${cur.tasksLate > 1 ? 's' : ''}` : ''),
    )
  }
  return out.slice(0, 4)
}

export const QUESTIONS = [
  'Qu’est-ce qui t’a donné le plus d’énergie cette semaine ?',
  'Qu’as-tu repoussé, et qu’est-ce qui se cache derrière ?',
  'Quelle décision as-tu prise, et qu’en attends-tu ?',
  'Si la semaine prochaine devait être simple, quelle serait la seule chose à réussir ?',
  'Qu’est-ce qui t’a fait perdre du temps ?',
  'Quand t’es-tu senti vraiment bien, et que faisais-tu juste avant ?',
  'Que ferais-tu différemment si tu recommençais lundi ?',
  'Qu’est-ce que tu aimerais arrêter de porter dans ta tête ?',
  'Qui t’a aidé cette semaine, et l’as-tu remercié ?',
  'Quel petit progrès mérite d’être remarqué ?',
  'Qu’est-ce qui t’a surpris sur toi-même ?',
  'Qu’est-ce que tu sais maintenant que tu ne savais pas lundi dernier ?',
]

/** Une question par semaine ; le contexte passe avant la rotation. */
export function questionFor(start: DayKey, cur: WeekStats, prev: WeekStats | null, sleepGoalH: number): string {
  if (cur.sessions === 0 && (prev?.sessions ?? 0) > 0) return 'Qu’est-ce qui a rendu l’entraînement difficile cette semaine ?'
  if (cur.avgSleepH !== null && cur.avgSleepH < sleepGoalH - 1) return 'Qu’est-ce qui a gêné ton sommeil cette semaine ?'
  if (cur.tasksLate >= 4) return 'Parmi tes tâches ouvertes, lesquelles comptent vraiment ?'
  const n = Math.floor(Date.parse(start) / (7 * 86_400_000))
  return QUESTIONS[((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length]
}
