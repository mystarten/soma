import type { Program, ProgramSession, ProgramWeek, Workout } from '../types'

/* ──────────────────────────────────────────────────────────────────────────
   Roulement du programme. Les séances sont indépendantes, mais rangées en « socles » :
   street workout (T, M, P), jambes (J), abdos (A). Règles :
   – dans un socle, on ne revient pas sur une séance avant d'avoir fait toutes les autres ;
   – jamais deux fois de suite la même séance ;
   – d'un socle à l'autre, aucune contrainte (haut du corps + abdos, abdos + jambes, etc.).
   Pur, sans React, testé dans rotation.test.ts.
   ────────────────────────────────────────────────────────────────────────── */

export const SOCLE_LABEL: Record<string, string> = {
  street: 'Street workout',
  jambes: 'Jambes',
  abdos: 'Abdos',
}
export const SOCLE_ORDER = ['street', 'jambes', 'abdos']

/** Le socle d'une séance, d'après la lettre de son code (T1, M1, P2 → street ; J1 → jambes ; A1 → abdos). */
export function socleOf(code: string): string {
  const l = (code[0] ?? '').toUpperCase()
  if (l === 'A') return 'abdos'
  if (l === 'J') return 'jambes'
  if ('TMP'.includes(l) && l) return 'street'
  return l.toLowerCase() || 'autre'
}

export type ItemState = 'available' | 'waiting' | 'finished'

export interface RotationItem {
  code: string
  title: string
  meta?: string
  socle: string
  doneWeeks: number[]
  /** Première semaine pas encore faite, ou null si tout est fait. */
  nextWeek: number | null
  week?: ProgramWeek
  state: ItemState
  /** Dernière fois faite pour de vrai (séance enregistrée), pas une simple coche de rattrapage. */
  lastDoneAt?: string
}

export interface SocleRotation {
  socle: string
  label: string
  items: RotationItem[]
  available: RotationItem[]
  waiting: RotationItem[]
  finished: RotationItem[]
  /** Nombre de semaines faites au total dans le socle. */
  doneTotal: number
  weeksTotal: number
}

/** Début de l'histoire d'une coche de rattrapage : ne compte jamais comme « dernière séance ». */
export const MARK_START = '2000-01-01T00:00:00.000Z'

export function nextWeekOf(session: ProgramSession, done: Set<number> | undefined): ProgramWeek | undefined {
  return [...session.weeks].sort((a, b) => a.n - b.n).find((w) => !done?.has(w.n))
}

/** code → date de la dernière vraie séance faite. */
export function lastDoneBySession(workouts: Pick<Workout, 'program' | 'startedAt' | 'backfill' | 'deleted'>[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const w of workouts) {
    if (w.deleted || w.backfill) continue
    for (const r of w.program ?? []) {
      if (!out.get(r.code) || w.startedAt > out.get(r.code)!) out.set(r.code, w.startedAt)
    }
  }
  return out
}

export function computeRotation(
  program: Pick<Program, 'sessions'>,
  done: Map<string, Set<number>>,
  lastDone: Map<string, string>,
): SocleRotation[] {
  const bySocle = new Map<string, RotationItem[]>()
  for (const s of program.sessions) {
    const d = done.get(s.code)
    const next = nextWeekOf(s, d)
    const item: RotationItem = {
      code: s.code,
      title: s.title,
      meta: s.meta,
      socle: socleOf(s.code),
      doneWeeks: [...(d ?? [])].sort((a, b) => a - b),
      nextWeek: next?.n ?? null,
      week: next,
      state: next ? 'waiting' : 'finished',
      lastDoneAt: lastDone.get(s.code),
    }
    bySocle.set(item.socle, [...(bySocle.get(item.socle) ?? []), item])
  }

  const order = [...SOCLE_ORDER, ...[...bySocle.keys()].filter((k) => !SOCLE_ORDER.includes(k))]
  const out: SocleRotation[] = []
  for (const socle of order) {
    const items = bySocle.get(socle)
    if (!items?.length) continue
    const open = items.filter((i) => i.nextWeek !== null)
    if (open.length) {
      const min = Math.min(...open.map((i) => i.nextWeek!))
      let candidates = open.filter((i) => i.nextWeek === min)
      /* Début de tour (tout le monde au même niveau) : jamais la séance qu'on vient de faire. */
      if (candidates.length === open.length && open.length > 1) {
        const recent = [...candidates].filter((i) => i.lastDoneAt).sort((a, b) => b.lastDoneAt!.localeCompare(a.lastDoneAt!))[0]
        if (recent) candidates = candidates.filter((i) => i !== recent)
      }
      for (const c of candidates) c.state = 'available'
    }
    out.push({
      socle,
      label: SOCLE_LABEL[socle] ?? socle,
      items,
      available: items.filter((i) => i.state === 'available'),
      waiting: items.filter((i) => i.state === 'waiting'),
      finished: items.filter((i) => i.state === 'finished'),
      doneTotal: items.reduce((a, i) => a + i.doneWeeks.length, 0),
      weeksTotal: program.sessions.filter((s) => socleOf(s.code) === socle).reduce((a, s) => a + s.weeks.length, 0),
    })
  }
  return out
}

/** Coches de rattrapage : « j'en suis à la semaine N » pour chaque socle, sans inventer de séance récente. */
export function backfillMarks(
  program: Pick<Program, 'sessions'>,
  weeksBySocle: Record<string, number>,
  makeId: () => string,
  now: string,
): Workout[] {
  const out: Workout[] = []
  for (const s of program.sessions) {
    const count = weeksBySocle[socleOf(s.code)] ?? 0
    for (const w of [...s.weeks].sort((a, b) => a.n - b.n)) {
      if (w.n > count) break
      out.push({
        id: makeId(),
        day: MARK_START.slice(0, 10),
        startedAt: MARK_START,
        durationMin: 0,
        kind: 'street',
        title: `${s.code} · S${w.n} (déjà faite)`,
        source: 'import',
        backfill: true,
        program: [{ code: s.code, week: w.n }],
        updatedAt: now,
      })
    }
  }
  return out
}

export type RefRemoval = { action: 'delete' } | { action: 'update'; program: NonNullable<Workout['program']> } | { action: 'none' }

/** Retirer la coche d'une séance/semaine d'un enregistrement : le supprime s'il n'avait que celle-là. */
export function removeRef(w: Pick<Workout, 'program'>, code: string, week: number): RefRemoval {
  const refs = w.program ?? []
  if (!refs.some((r) => r.code === code && r.week === week)) return { action: 'none' }
  const rest = refs.filter((r) => !(r.code === code && r.week === week))
  return rest.length ? { action: 'update', program: rest } : { action: 'delete' }
}
