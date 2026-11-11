import type {
  DayKey,
  ExerciseDef,
  MuscleMix,
  Program,
  ProgramBlock,
  ProgramRef,
  ProgramSession,
  ProgramWeek,
  SetEntry,
  Workout,
  WorkoutKind,
} from '../types'
import { dayDiff } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   Programme d'entraînement : lecture d'un tableau « séance × semaine »,
   lecture des cases (« 5 x 6  +25 kg », « 60 - 55 - 50 »…), correspondance avec
   la bibliothèque d'exercices et préremplissage d'une séance.
   Chaque séance et chaque semaine sont indépendantes : rien n'impose d'ordre.
   Aucune dépendance React, aucune donnée personnelle en dur.
   ────────────────────────────────────────────────────────────────────────── */

/** Contenu d'un document : paragraphes et tableaux, dans l'ordre. */
export type DocBlock = { type: 'p'; text: string } | { type: 'table'; rows: string[][] }

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim()

/* ── Dates ─────────────────────────────────────────────────────────────── */

const MONTHS: Record<string, number> = {
  janv: 1, jan: 1, janvier: 1,
  fevr: 2, fev: 2, fevrier: 2,
  mars: 3, mar: 3,
  avr: 4, avril: 4,
  mai: 5,
  juin: 6,
  juil: 7, juillet: 7,
  aout: 8,
  sept: 9, sep: 9, septembre: 9,
  oct: 10, octobre: 10,
  nov: 11, novembre: 11,
  dec: 12, decembre: 12,
}

const monthOf = (s: string): number | undefined => MONTHS[strip(s).replace(/\./g, '')]

interface RawRange {
  d1: number
  m1: number
  d2: number
  m2: number
}

/** « 12-18 oct », « 26 oct-1 nov », « 28 déc-3 jan ». */
export function parseRangeLabel(label: string): RawRange | null {
  const m = /(\d{1,2})\s*([A-Za-zÀ-ÿ.]+)?\s*[-–]\s*(\d{1,2})\s*([A-Za-zÀ-ÿ.]+)/.exec(label)
  if (!m) return null
  const m2 = monthOf(m[4])
  const m1 = m[2] ? monthOf(m[2]) : m2
  if (!m1 || !m2) return null
  return { d1: Number(m[1]), m1, d2: Number(m[3]), m2 }
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Place les semaines dans le calendrier. Les libellés n'ont pas d'année : la première
 * semaine est celle qui tombe le plus près de `ref` (de 200 jours avant à 165 jours après),
 * puis l'année avance quand le mois repasse à janvier.
 */
export function resolveWeekDates(labels: string[], ref: DayKey): ({ start: DayKey; end: DayKey } | null)[] {
  const out: ({ start: DayKey; end: DayKey } | null)[] = []
  const refYear = Number(ref.slice(0, 4))
  let year: number | null = null
  let prevStart: DayKey | null = null
  for (const label of labels) {
    const r = parseRangeLabel(label)
    if (!r) {
      out.push(null)
      continue
    }
    const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
    if (year === null) {
      const cands = [refYear - 1, refYear, refYear + 1].map((y) => ({ y, diff: dayDiff(ref, key(y, r.m1, r.d1)) }))
      const ok = cands.filter((c) => c.diff >= -200 && c.diff <= 165)
      const best = (ok.length ? ok : cands).sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0]
      year = best.y
    }
    let start = key(year, r.m1, r.d1)
    if (prevStart && start < prevStart) {
      year += 1
      start = key(year, r.m1, r.d1)
    }
    const endYear = r.m2 < r.m1 ? year + 1 : year
    out.push({ start, end: key(endYear, r.m2, r.d2) })
    prevStart = start
  }
  return out
}

/* ── Lecture du document ───────────────────────────────────────────────── */

const secOf = (text: string): number | undefined => {
  const t = strip(text)
  let m = /repos\s+(\d+):(\d{2})/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /(\d+)\s*min\s+de\s+repos/.exec(t) ?? /repos\s+(\d+)\s*min/.exec(t)
  if (m) return Number(m[1]) * 60
  m = /repos\s+(\d+)\s*s\b/.exec(t)
  if (m) return Number(m[1])
  return undefined
}

const durationOf = (meta: string): number | undefined => {
  const m = /(\d+)(?:\s*[-–]\s*(\d+))?\s*min/.exec(meta)
  return m ? Number(m[2] ?? m[1]) : undefined
}

/** Titre de séance : « T1  Tirage lesté force-endurance    70 min · … ». */
export function parseSessionTitle(text: string): { code: string; title: string; meta?: string } | null {
  const t = text.replace(/ /g, ' ').trim()
  const m = /^([A-Z]{1,2}\d{1,2})\s{1,}(\S.*)$/.exec(t)
  if (!m) return null
  const parts = m[2].split(/\s{3,}/)
  return { code: m[1], title: clean(parts[0]), meta: parts[1] ? clean(parts.slice(1).join(' ')) : undefined }
}

/** Un tableau « Semaine | blocs… | Fait » devient les blocs et les semaines d'une séance. */
export function parseSessionTable(
  rows: string[][],
  head: { code: string; title: string; meta?: string },
  ref: DayKey,
): ProgramSession | null {
  if (rows.length < 2) return null
  const header = rows[0].map((c) => c.replace(/ /g, ' ').trim())
  const hasFait = /^fait$/i.test(header[header.length - 1] ?? '')
  const blockCols = header.slice(1, hasFait ? header.length - 1 : header.length)
  if (!blockCols.length) return null

  const blocks: ProgramBlock[] = blockCols.map((h) => {
    const lines = h.split('\n').map(clean).filter(Boolean)
    return {
      name: lines[0] ?? 'Bloc',
      note: lines.slice(1).join(' · ') || undefined,
      restSec: secOf(lines.slice(1).join(' ')),
      cells: [],
    }
  })

  const weeks: ProgramWeek[] = []
  for (const row of rows.slice(1)) {
    const first = clean(row[0] ?? '')
    const m = /^S(\d+)\s*(.*)$/i.exec(first)
    if (!m) continue
    const label = clean(m[2])
    const flags = strip(label)
    const cells = blockCols.map((_, i) => clean((row[i + 1] ?? '').replace(/\n+/g, ' ')))
    weeks.push({
      n: Number(m[1]),
      label: label.replace(/\s*·\s*(léger|leger|test)\s*$/i, '').trim(),
      light: /\bleger\b/.test(flags),
      test: /\btest\b/.test(flags) || cells.some((c) => /^TEST\b/i.test(c)),
    })
    cells.forEach((c, i) => blocks[i].cells.push(c))
  }
  if (!weeks.length) return null

  const dates = resolveWeekDates(
    weeks.map((w) => w.label),
    ref,
  )
  weeks.forEach((w, i) => {
    if (dates[i]) {
      w.startDay = dates[i]!.start
      w.endDay = dates[i]!.end
    }
  })
  return {
    code: head.code,
    title: head.title,
    meta: head.meta,
    durationMin: head.meta ? durationOf(head.meta) : undefined,
    weeks,
    blocks,
  }
}

/** Tout le document : nom du programme + toutes les séances reconnues. */
export function parseProgramDocument(
  blocks: DocBlock[],
  ref: DayKey,
): { name: string; sessions: ProgramSession[] } {
  const sessions: ProgramSession[] = []
  let name = ''
  let pending: { code: string; title: string; meta?: string } | null = null
  for (const b of blocks) {
    if (b.type === 'p') {
      const t = b.text.trim()
      if (!t) continue
      const head = parseSessionTitle(t)
      if (head) pending = head
      else if (!name) name = clean(t.split(/\s{3,}/)[0])
    } else if (pending) {
      const s = parseSessionTable(b.rows, pending, ref)
      if (s && !sessions.some((x) => x.code === s.code)) sessions.push(s)
      pending = null
    }
  }
  return { name: name || 'Mon programme', sessions }
}

/* ── Lecture d'une case ────────────────────────────────────────────────── */

export interface PlannedSet {
  reps?: number
  loadKg?: number
  holdSec?: number
  distanceM?: number
  /** Précise l'exercice quand une case en mélange plusieurs (« tractions », « pompes »). */
  hint?: 'tractions' | 'pompes'
  restSec?: number
  note?: string
}

export interface PlannedCell {
  /** Jour de repos prévu : rien à faire. */
  rest: boolean
  /** Test de fin de cycle. */
  test: boolean
  sets: PlannedSet[]
  text: string
}

const num = (s: string) => Number(s.replace(',', '.'))

function loadAndNote(rest: string): { loadKg?: number; note?: string; restSec?: number } {
  let r = ` ${rest} `
  let loadKg: number | undefined
  let restSec: number | undefined
  const rm = /\brepos\s+(\d+):(\d{2})/i.exec(r)
  if (rm) {
    restSec = Number(rm[1]) * 60 + Number(rm[2])
    r = r.replace(rm[0], ' ')
  }
  const m = /(?:^|[\s·+])(\+?)(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(r)
  if (m) {
    loadKg = num(m[2])
    r = r.replace(m[0], ' ')
  }
  const note = clean(r.replace(/[·]/g, ' ')).replace(/^poids du corps$/i, '')
  return { loadKg, note: note || undefined, restSec }
}

export interface CellContext {
  /** Nombre de tours (bloc « Tours » du tableau) : les cases par tour sont répétées. */
  tours?: number
}

/** « 5 x 6  +25 kg » → 5 séries de 6 reps à +25 kg ; « 60 - 55 - 50 » → trois séries. */
export function parseCell(textRaw: string, ctx: CellContext = {}): PlannedCell {
  const text = clean(textRaw)
  const t = text.replace(/\s+/g, ' ')
  const out = (p: Partial<PlannedCell> & { sets: PlannedSet[] }): PlannedCell => ({
    rest: false,
    test: false,
    text,
    ...p,
  })
  if (!t || /^repos$/i.test(t)) return out({ rest: true, sets: [] })

  const isTest = /^(léger\s+)?TEST\b/i.test(t) && /^TEST\b/i.test(t)
  if (isTest) {
    const load = /\+\s*(\d+(?:[.,]\d+)?)\s*kg/i.exec(t)
    return out({ test: true, sets: [{ loadKg: load ? num(load[1]) : undefined, note: t.replace(/^TEST\s*/i, '') }] })
  }

  let m: RegExpExecArray | null

  /* Pyramide : « sommet 20 + 40  5-10-15-20-15-10-5 » (tractions, puis pompes en double). */
  m = /^(?:léger\s+)?sommet\s+(\d+)\s*\+\s*(\d+)\s*([\d-]*)$/i.exec(t)
  if (m) {
    const top = Number(m[1])
    let steps = m[3] ? m[3].split('-').filter(Boolean).map(Number) : []
    if (!steps.length) {
      const up = Array.from({ length: Math.max(1, Math.floor(top / 5)) }, (_, i) => (i + 1) * 5)
      steps = [...up, ...up.slice(0, -1).reverse()]
    }
    return out({
      sets: [
        ...steps.map((reps): PlannedSet => ({ reps, hint: 'tractions' })),
        ...steps.map((reps): PlannedSet => ({ reps: reps * 2, hint: 'pompes' })),
      ],
    })
  }

  /* Séries × reps, tenue en secondes ou charge : « 4 x 10  +20 kg », « 3 x 40 s », « 3 x 12 · 10 kg ». */
  m = /^(\d+)\s*[x×]\s*(\d+)(\s*s\b)?(.*)$/i.exec(t)
  if (m) {
    const count = Number(m[1])
    const n = Number(m[2])
    const { loadKg, note, restSec } = loadAndNote(m[4] ?? '')
    const one: PlannedSet = m[3] ? { holdSec: n, loadKg, note, restSec } : { reps: n, loadKg, note, restSec }
    return out({ sets: Array.from({ length: count }, () => ({ ...one })) })
  }

  /* Plusieurs séries nommées : « 60 - 55 - 50 ». */
  m = /^(\d+)(?:\s*[-–]\s*\d+)+$/.exec(t)
  if (m) {
    return out({ sets: t.split(/\s*[-–]\s*/).map((x) => ({ reps: Number(x) })) })
  }

  /* Série fractionnée : « 40 + 15 + 10 », « Fract. 18 + 7 + 6 + 5 » → une grosse série. */
  m = /^(?:fract\.?\s*)?(\d+(?:\s*\+\s*\d+)+)$/i.exec(t)
  if (m) {
    const parts = m[1].split(/\s*\+\s*/).map(Number)
    return out({
      sets: [{ reps: parts.reduce((a, b) => a + b, 0), note: `fractionné ${parts.join(' + ')}` }],
    })
  }

  /* Alternance de minutes : « 16 min  11 tractions / 20 pompes ». */
  m = /^(\d+)\s*min\s+(\d+)\s*tractions?\s*\/\s*(\d+)\s*pompes?$/i.exec(t)
  if (m) {
    const minutes = Number(m[1])
    return out({
      sets: [
        { reps: Math.ceil(minutes / 2) * Number(m[2]), hint: 'tractions', note: `EMOM ${minutes} min` },
        { reps: Math.floor(minutes / 2) * Number(m[3]), hint: 'pompes', note: `EMOM ${minutes} min` },
      ],
    })
  }

  /* EMOM : « EMOM 10 min  8 / min », « 10 min  18 / min ». */
  m = /^(?:EMOM\s+)?(\d+)\s*min\s+(\d+)\s*\/\s*min$/i.exec(t)
  if (m) {
    return out({ sets: [{ reps: Number(m[1]) * Number(m[2]), note: `EMOM ${m[1]} min · ${m[2]} / min` }] })
  }

  /* Rameur : « 330 m  1:48 » (par tour), « 330 m moins de 1:45 de moyenne ». */
  m = /^(\d+)\s*m\s+(.+)$/.exec(t)
  if (m) {
    const n = Math.max(1, ctx.tours ?? 1)
    const pace = /^\d+:\d{2}$/.test(m[2]) ? `allure ${m[2]} / 500 m` : m[2]
    return out({ sets: Array.from({ length: n }, () => ({ distanceM: Number(m![1]), note: pace })) })
  }

  /* « 32 reps », « 28 reps  facile ». */
  m = /^(\d+)\s*reps?\b(.*)$/i.exec(t)
  if (m) return out({ sets: [{ reps: Number(m[1]), note: clean(m[2]) || undefined }] })

  /* « 10 tours », « 7 tours ». */
  m = /^(\d+)\s*tours?\b/i.exec(t)
  if (m) return out({ sets: [] })

  /* « montée / 6 trac. corde » (par tour). */
  m = /^montée\s*\/\s*(\d+)\s*trac/i.exec(t)
  if (m) {
    const n = Math.max(1, ctx.tours ?? 1)
    return out({ sets: Array.from({ length: n }, () => ({ reps: Number(m![1]), note: 'montée + tractions de corde' })) })
  }

  /* Un simple nombre : par tour s'il y en a, sinon une série. */
  m = /^(\d+)$/.exec(t)
  if (m) {
    const n = Math.max(1, ctx.tours ?? 1)
    return out({ sets: Array.from({ length: n }, () => ({ reps: Number(m![1]) })) })
  }

  /* Rien de reconnu : on garde le texte tel quel dans une série à compléter. */
  return out({ sets: [{ note: t }] })
}

/* ── Correspondance avec les exercices ─────────────────────────────────── */

type Match = { id: string; custom?: Omit<ExerciseDef, 'updatedAt'> }

const norm = (s: string) => strip(s).replace(/^[a-z]\.\s*/, '')

const slug = (s: string) =>
  strip(s)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

const RULES: [RegExp, string][] = [
  [/muscle-?ups?/, 'ex_muscle_up'],
  [/explosives?.*lest/, 'ex_tractions_lestees'],
  [/explosives?/, 'ex_tractions_pronation'],
  [/^lestees?/, 'ex_tractions_lestees'],
  [/prise neutre/, 'ex_tractions_serrees'],
  [/dips?/, 'ex_dips'],
  [/diamant/, 'ex_pompes_diamant'],
  [/pompes?/, 'ex_pompes'],
  [/corde/, 'ex_corde_grimper'],
  [/planche laterale|gainage lateral/, 'ex_gainage_lateral'],
  [/planche|gainage/, 'ex_gainage'],
  [/hollow/, 'ex_hollow_body'],
  [/l-?sit/, 'ex_lsit'],
  [/releves?.*(jambes|genoux|diagonale)|pieds a la barre/, 'ex_releves_jambes'],
  [/crunch/, 'ex_crunch'],
  [/superman/, 'ex_superman'],
  [/mollets?/, 'ex_mollets'],
  [/souleve de terre/, 'ex_souleve_terre'],
  [/pont fessier|hip thrust/, 'ex_hip_thrust'],
  [/pistol/, 'ex_pistol_squats'],
  [/squat bulgare|fentes?/, 'ex_fentes'],
  [/tractions?/, 'ex_tractions_pronation'],
]

/** Si le nom du bloc ne dit rien (« Presque max », « Finisher »), le titre de la séance décide. */
const TITLE_RULES: [RegExp, string][] = [
  [/pompes?/, 'ex_pompes'],
  [/tirage|tractions?/, 'ex_tractions_pronation'],
]

interface CustomSpec {
  re: RegExp
  name: string
  group: string
  kind: ExerciseDef['kind']
  unit: ExerciseDef['unit']
  mix: MuscleMix
}

const CUSTOMS: CustomSpec[] = [
  { re: /rameur/, name: 'Rameur', group: 'Cardio', kind: 'cardio', unit: 'meters', mix: { quadriceps: 0.6, dorsaux: 0.6, ischios: 0.4, biceps: 0.3, abdos: 0.3, fessiers: 0.4 } },
  { re: /copenhag/, name: 'Copenhagen', group: 'Gainage', kind: 'static', unit: 'seconds', mix: { adducteurs: 1, obliques: 0.5, abdos: 0.3 } },
  { re: /dragon/, name: 'Dragon flag', group: 'Gainage', kind: 'core', unit: 'reps', mix: { abdos: 1, obliques: 0.4, dorsaux: 0.3, deltoides_ant: 0.2 } },
  { re: /good morning/, name: 'Good morning lesté', group: 'Jambes', kind: 'weighted', unit: 'reps', mix: { lombaires: 1, ischios: 0.8, fessiers: 0.5 } },
  { re: /descente de marche/, name: 'Descente de marche', group: 'Jambes', kind: 'bodyweight', unit: 'reps', mix: { quadriceps: 1, fessiers: 0.5, mollets: 0.3 } },
  { re: /pogo/, name: 'Pogos (sauts réactifs)', group: 'Jambes', kind: 'bodyweight', unit: 'reps', mix: { mollets: 1, quadriceps: 0.3, tibias: 0.3 } },
  { re: /pointes? de pieds?/, name: 'Relevés de pointes de pieds', group: 'Jambes', kind: 'bodyweight', unit: 'reps', mix: { tibias: 1 } },
]

/** Quel exercice correspond à ce bloc ? La bibliothèque d'abord, sinon un exercice créé à l'import. */
export function matchExercise(blockName: string, sessionTitle: string): Match {
  const n = norm(blockName)
  for (const c of CUSTOMS) {
    if (c.re.test(n)) {
      return {
        id: `ex_prog_${slug(c.name)}`,
        custom: { id: `ex_prog_${slug(c.name)}`, name: c.name, group: c.group, kind: c.kind, unit: c.unit, mix: c.mix },
      }
    }
  }
  for (const [re, id] of RULES) if (re.test(n)) return { id }
  const t = norm(sessionTitle)
  for (const [re, id] of TITLE_RULES) if (re.test(t)) return { id }
  const name = clean(blockName.replace(/^[A-Z]\.\s*/, ''))
  const id = `ex_prog_${slug(name)}`
  return {
    id,
    custom: { id, name, group: 'Programme', kind: 'bodyweight', unit: 'reps', mix: { abdos: 0.3 } },
  }
}

/** Exercices à créer parce qu'ils n'existent pas encore dans la bibliothèque. */
export function missingExercises(
  sessions: ProgramSession[],
  existingIds: Set<string>,
): Omit<ExerciseDef, 'updatedAt'>[] {
  const out = new Map<string, Omit<ExerciseDef, 'updatedAt'>>()
  for (const s of sessions) {
    for (const b of s.blocks) {
      if (/^tours?$/i.test(norm(b.name))) continue
      const m = matchExercise(b.name, s.title)
      if (m.custom && !existingIds.has(m.id) && !out.has(m.id)) out.set(m.id, m.custom)
    }
  }
  return [...out.values()]
}

/* ── Préparer une séance ───────────────────────────────────────────────── */

export interface ProgramPick {
  code: string
  week: number
}

const DEFAULT_REST = 90

export interface BuiltWorkout {
  title: string
  durationMin: number
  kind: WorkoutKind
  sets: SetEntry[]
  notes: string
  program: ProgramRef[]
}

/**
 * Prépare les séries de une ou plusieurs séances du programme (par exemple T1 semaine 5
 * + A1 semaine 1 le même jour). Tout reste modifiable ensuite dans l'éditeur.
 */
export function buildFromProgram(
  program: Pick<Program, 'sessions'>,
  picks: ProgramPick[],
  makeId: () => string,
): BuiltWorkout | null {
  const lines: string[] = []
  const sets: SetEntry[] = []
  const refs: ProgramRef[] = []
  const titles: string[] = []
  let duration = 0
  const codes: string[] = []

  for (const pick of picks) {
    const session = program.sessions.find((s) => s.code === pick.code)
    const wi = session?.weeks.findIndex((w) => w.n === pick.week) ?? -1
    if (!session || wi < 0) continue
    const week = session.weeks[wi]
    refs.push({ code: session.code, week: week.n })
    codes.push(session.code)
    duration += session.durationMin ?? 30
    titles.push(`${session.code} · S${week.n}${week.light ? ' léger' : ''}${week.test ? ' test' : ''}`)
    lines.push(`${session.code} — ${session.title} · semaine ${week.n} (${week.label})${week.light ? ' · légère' : ''}`)

    const toursBlock = session.blocks.find((b) => /^tours?$/i.test(norm(b.name)))
    const tours = toursBlock ? Number(/(\d+)/.exec(toursBlock.cells[wi] ?? '')?.[1]) || undefined : undefined
    if (toursBlock && toursBlock.cells[wi]) lines.push(`  ${toursBlock.cells[wi]}`)

    session.blocks.forEach((block, bi) => {
      if (block === toursBlock) return
      const cell = parseCell(block.cells[wi] ?? '', { tours })
      if (cell.rest) return
      const match = matchExercise(block.name, session.title)
      const key = `${session.code}-${bi + 1}`
      lines.push(`  ${clean(block.name)} : ${cell.text}`)
      for (const p of cell.sets) {
        const hint = p.hint
        const exerciseId =
          hint === 'pompes' ? 'ex_pompes' : hint === 'tractions' ? 'ex_tractions_pronation' : match.id
        const blockKey = hint ? `${key}-${hint}` : key
        const noteBits = [p.note, cell.test ? 'test' : undefined].filter(Boolean)
        sets.push({
          id: makeId(),
          exerciseId,
          block: blockKey,
          reps: p.reps,
          loadKg: p.loadKg,
          holdSec: p.holdSec,
          distanceM: p.distanceM,
          restSec: p.restSec ?? block.restSec ?? DEFAULT_REST,
          note: noteBits.length ? noteBits.join(' · ') : undefined,
        })
      }
    })
  }
  if (!refs.length) return null
  const kind: WorkoutKind = codes.every((c) => c.startsWith('A')) ? 'abdos' : 'street'
  return {
    title: titles.join(' + '),
    durationMin: duration,
    kind,
    sets,
    notes: ['Programme', ...lines].join('\n'),
    program: refs,
  }
}

/* ── Suivi ─────────────────────────────────────────────────────────────── */

/** code → semaines faites, d'après les séances enregistrées. */
export function programDone(workouts: Pick<Workout, 'program'>[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>()
  for (const w of workouts) {
    for (const r of w.program ?? []) {
      const set = map.get(r.code) ?? new Set<number>()
      set.add(r.week)
      map.set(r.code, set)
    }
  }
  return map
}

/** La semaine à proposer pour une séance : celle de la date du jour, sinon la première non faite. */
export function suggestWeek(session: ProgramSession, done: Set<number> | undefined, today: DayKey): number {
  const current = session.weeks.find((w) => w.startDay && w.endDay && w.startDay <= today && today <= w.endDay)
  if (current && !done?.has(current.n)) return current.n
  const next = session.weeks.find((w) => !done?.has(w.n))
  return (next ?? current ?? session.weeks[0]).n
}

/** La semaine du programme qui contient un jour donné (pour une séance), s'il y en a une. */
export function weekOfDay(session: ProgramSession, day: DayKey): ProgramWeek | undefined {
  return session.weeks.find((w) => w.startDay && w.endDay && w.startDay <= day && day <= w.endDay)
}

export interface ProgramStats {
  total: number
  done: number
  /** Séances faites dont la semaine est la semaine en cours. */
  thisWeekDone: number
  thisWeekTotal: number
}

export function programStats(program: Pick<Program, 'sessions'>, workouts: Pick<Workout, 'program'>[], today: DayKey): ProgramStats {
  const done = programDone(workouts)
  let total = 0
  let d = 0
  let thisWeekDone = 0
  let thisWeekTotal = 0
  for (const s of program.sessions) {
    for (const w of s.weeks) {
      total += 1
      const isDone = done.get(s.code)?.has(w.n) ?? false
      if (isDone) d += 1
      if (w.startDay && w.endDay && w.startDay <= today && today <= w.endDay) {
        thisWeekTotal += 1
        if (isDone) thisWeekDone += 1
      }
    }
  }
  return { total, done: d, thisWeekDone, thisWeekTotal }
}

/** Jour de début de la première semaine, pour afficher « programme du … au … ». */
export function programSpan(program: Pick<Program, 'sessions'>): { start?: DayKey; end?: DayKey } {
  const starts = program.sessions.flatMap((s) => s.weeks.map((w) => w.startDay).filter(Boolean) as DayKey[]).sort()
  const ends = program.sessions.flatMap((s) => s.weeks.map((w) => w.endDay).filter(Boolean) as DayKey[]).sort()
  return { start: starts[0], end: ends[ends.length - 1] }
}

