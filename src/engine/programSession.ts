import type { DayKey, Iso, Program, ProgramRef, ProgramSession, RunDetail, SetEntry, Workout } from '../types'
import { buildFromProgram, expandEmom, isPlannedWeek, plannedWeeks } from './program'
import { sessionWeekOn, sessionWeekStart } from './todayPlan'
import { dayDiff } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Ajouter une séance du programme depuis le calendrier : choix de la séance et de la semaine,
   séries préremplies d'après la prescription, détection des doublons, et nettoyage des anciens liens du journal.
   Tout est pur (pas d'accès à la base) pour rester testable.
   ────────────────────────────────────────────────────────────────────────── */

/** Début réel d'une séance : jour choisi + heure `HH:MM`. */
export const startedAtOf = (day: string, time: string): string => {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0, 0, 0).toISOString()
}

/** Les séances que l'on peut proposer : celles qui ont au moins une semaine avec du contenu. */
export function sessionChoices(program: Pick<Program, 'sessions'>): ProgramSession[] {
  return program.sessions.filter((s) => plannedWeeks(s).length > 0)
}

/**
 * La semaine à proposer pour une séance un jour donné : celle du programme qui contient ce jour.
 * Si ce jour tombe avant le début de la séance ou sur une semaine sans rien de prévu, la semaine avec contenu la plus proche.
 */
export function defaultWeek(program: Pick<Program, 'sessions'>, session: ProgramSession, day: DayKey, override?: DayKey): number | null {
  const weeks = plannedWeeks(session)
  if (!weeks.length) return null
  const on = sessionWeekOn(program, session, day, override)
  if (on && isPlannedWeek(session, on.week)) return on.week.n
  let best = weeks[0]
  let bestGap = Infinity
  for (const w of weeks) {
    const start = sessionWeekStart(program, session, session.weeks.indexOf(w), override)
    if (!start) continue
    const gap = Math.abs(dayDiff(day, start))
    if (gap < bestGap) {
      best = w
      bestGap = gap
    }
  }
  return best.n
}

export interface SessionDraft {
  title: string
  durationMin: number
  kind: Workout['kind']
  sets: SetEntry[]
  /** Détail de la prescription (texte), conservé dans les notes de la séance. */
  notes: string
  program: ProgramRef[]
}

/** Les séries de la prescription de cette séance et de cette semaine, prêtes à être corrigées. */
export function draftSession(program: Pick<Program, 'sessions'>, code: string, week: number, makeId: () => string): SessionDraft | null {
  const built = buildFromProgram(program, [{ code, week }], makeId)
  if (!built) return null
  return { ...built, sets: expandEmom(built.sets) }
}

export interface SessionSaveInput {
  id: string
  draft: SessionDraft
  day: DayKey
  /** `HH:MM`. */
  time: string
  durationMin: number
  rpe?: number
  note: string
  sets: SetEntry[]
  today: DayKey
  now: Iso
  /** Sortie de course : durée, distance, douleur au tibia. */
  run?: RunDetail
  /** Séance « prévue » qu'on valide : on la met à jour au lieu d'en créer une autre. */
  existing?: Workout
}

/** Une séance du programme à enregistrer. Un jour futur donne une séance « prévue » (elle ne compte pas encore). */
export function workoutFromSession(i: SessionSaveInput): Workout {
  const planned = i.day > i.today
  const note = i.note.trim()
  const w: Workout = {
    ...(i.existing ?? {}),
    id: i.existing?.id ?? i.id,
    day: i.day,
    startedAt: startedAtOf(i.day, i.time),
    durationMin: Math.max(1, Math.round(i.durationMin) || i.draft.durationMin),
    kind: i.draft.kind,
    title: i.draft.title,
    rpe: planned ? undefined : i.rpe,
    feeling: planned ? undefined : 3,
    notes: [note, i.draft.notes].filter(Boolean).join('\n\n'),
    sets: i.run ? undefined : i.sets,
    run: i.run,
    program: i.draft.program,
    planned: planned || undefined,
    source: i.existing?.source ?? 'manual',
    updatedAt: i.now,
  }
  return w
}

/** Une séance du programme déjà enregistrée (ou prévue) ce jour-là pour la même semaine. */
export function findDuplicate<T extends Pick<Workout, 'id' | 'day' | 'program' | 'deleted' | 'backfill'>>(workouts: T[], code: string, week: number, day: DayKey, exceptId?: string): T | undefined {
  return workouts.find((w) => !w.deleted && !w.backfill && w.id !== exceptId && w.day === day && (w.program ?? []).some((r) => r.code === code && r.week === week))
}

/* ── Nettoyage unique des anciens liens du journal ──────────────────────── */

export interface LinkChange {
  id: string
  day: DayKey
  oldTitle: string
  newTitle: string
  moves: { code: string; from: number; to: number }[]
  program: ProgramRef[]
}

export interface LinkCleanup {
  changes: LinkChange[]
  /** Séances liées au programme dont la date tombe hors de toute semaine du programme : laissées telles quelles. */
  outside: number
}

/**
 * Pour chaque séance du journal liée au programme, la semaine qu'indique sa date (d'après les semaines du programme actuel).
 * Ne propose rien quand la semaine est déjà la bonne, quand la date est hors programme ou quand la semaine n'a rien de prévu.
 */
export function linkCleanup(program: Pick<Program, 'sessions'>, workouts: Pick<Workout, 'id' | 'day' | 'title' | 'program' | 'deleted' | 'backfill'>[], override?: DayKey): LinkCleanup {
  const changes: LinkChange[] = []
  let outside = 0
  for (const w of workouts) {
    if (w.deleted || w.backfill || !w.program?.length) continue
    const moves: LinkChange['moves'] = []
    let out = false
    const refs = w.program.map((r) => {
      const session = program.sessions.find((s) => s.code === r.code)
      if (!session) return r
      const on = sessionWeekOn(program, session, w.day, override)
      if (!on) {
        out = true
        return r
      }
      if (!isPlannedWeek(session, on.week) || on.week.n === r.week) return r
      moves.push({ code: r.code, from: r.week, to: on.week.n })
      return { ...r, week: on.week.n }
    })
    if (!moves.length) {
      if (out) outside += 1
      continue
    }
    let title = w.title ?? ''
    for (const m of moves) title = title.replace(new RegExp(`\\b${m.code} · S${m.from}(?!\\d)`), `${m.code} · S${m.to}`)
    changes.push({ id: w.id, day: w.day, oldTitle: w.title ?? '', newTitle: title, moves, program: refs })
  }
  changes.sort((a, b) => a.day.localeCompare(b.day))
  return { changes, outside }
}

/** La séance avec son lien (et son titre) corrigés. */
export function applyLinkChange<T extends Pick<Workout, 'title' | 'program'>>(w: T, c: LinkChange): T {
  return { ...w, program: c.program, title: c.newTitle || w.title }
}
