import type { DayKey, Workout } from '../types'
import { addDayKey } from './time'
import { SOCLE_ORDER, type RotationItem, type SocleRotation } from './rotation'

/** Jours d'entraînement d'affilée (en comptant aujourd'hui, ou hier si rien n'est encore fait aujourd'hui). */
export function trainingStreak(workouts: Pick<Workout, 'day' | 'backfill' | 'planned' | 'deleted'>[], today: DayKey): { days: number; todayDone: boolean } {
  const days = new Set(workouts.filter((w) => !w.backfill && !w.planned && !w.deleted).map((w) => w.day))
  const todayDone = days.has(today)
  let cursor = todayDone ? today : addDayKey(today, -1)
  let n = 0
  while (days.has(cursor)) {
    n++
    cursor = addDayKey(cursor, -1)
  }
  return { days: n, todayDone }
}

/** La séance à proposer : celle dont c'est le tour et qui n'a pas été faite depuis le plus longtemps. */
export function pickSuggestion(rotation: SocleRotation[]): RotationItem | null {
  const all = rotation.flatMap((r) => r.available)
  if (!all.length) return null
  const rank = (i: RotationItem) => SOCLE_ORDER.indexOf(i.socle)
  return [...all].sort((a, b) => {
    const la = a.lastDoneAt ?? ''
    const lb = b.lastDoneAt ?? ''
    if (la !== lb) return la < lb ? -1 : 1
    return rank(a) - rank(b)
  })[0]
}

export interface SimpleAdvice {
  tone: 'good' | 'rest' | 'info'
  title: string
  detail: string
  /** Vrai quand le repos est conseillé aujourd'hui. */
  rest: boolean
}

/** Conseil du jour, uniquement d'après les jours d'affilée et le repos choisi (2 ou 3 jours). */
export function simpleAdvice({ streak, todayDone, restEvery }: { streak: number; todayDone: boolean; restEvery: number }): SimpleAdvice {
  if (todayDone) {
    return streak >= restEvery
      ? { tone: 'rest', rest: false, title: 'Séance faite : repos demain', detail: `${streak} jours d’affilée : un jour de repos s’impose avant de reprendre.` }
      : { tone: 'good', rest: false, title: 'Séance faite aujourd’hui', detail: `Jour ${streak} sur ${restEvery} avant un repos. Demain, tu peux en refaire une.` }
  }
  if (streak >= restEvery) return { tone: 'rest', rest: true, title: 'Repos conseillé aujourd’hui', detail: `${streak} jours d’affilée : laisse le corps récupérer, tu reprends demain.` }
  return {
    tone: 'good',
    rest: false,
    title: 'Séance conseillée aujourd’hui',
    detail: streak ? `Jour ${streak + 1} sur ${restEvery} avant un repos.` : 'Tu es reposé : bonne journée pour t’entraîner.',
  }
}
