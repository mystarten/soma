import Papa from 'papaparse'
import type {
  CheckIn,
  DayKey,
  HrZoneMinutes,
  Iso,
  MuscleMix,
  Workout,
  WhoopFileKind,
  WhoopImportPreview,
  WorkoutKind,
} from '../types'
import { CARDIO_MIX, KIND_FALLBACK_MIX, RUN_MIX } from './muscleMap'
import { dayKey } from './time'
import { clamp } from './stats'

/* ──────────────────────────────────────────────────────────────────────────
   Import WHOOP — lecture 100 % locale, parseur tolérant.
   Les en-têtes sont détectés par nom (insensible à la casse, aux accents et
   à la ponctuation). Une colonne absente est simplement ignorée.
   ────────────────────────────────────────────────────────────────────────── */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

export interface ParsedRows {
  kind: WhoopFileKind
  headers: string[]
  rows: Record<string, string>[]
}

/** Détecte le type de fichier WHOOP d'après ses en-têtes. */
export function detectFileKind(headers: string[], fileName = ''): WhoopFileKind {
  const h = headers.map(norm)
  const has = (...keys: string[]) => keys.some((k) => h.some((x) => x.includes(norm(k))))
  const name = norm(fileName)
  if (has('activityname') || has('workoutstarttime')) return 'workouts'
  if (has('questiontext') || has('answeredyes')) return 'journal'
  if (has('daystrain') || has('recoveryscore')) return 'cycles'
  if (has('sleeponset') || has('asleepduration') || has('sleepperformance')) return 'sleeps'
  if (name.includes('workout')) return 'workouts'
  if (name.includes('sleep')) return 'sleeps'
  if (name.includes('cycle') || name.includes('physiological')) return 'cycles'
  if (name.includes('journal')) return 'journal'
  return 'unknown'
}

export function parseCsv(text: string, fileName = ''): ParsedRows {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  })
  const headers = (res.meta.fields ?? []).filter(Boolean)
  const rows = (res.data ?? []).filter((r) => r && Object.values(r).some((v) => v !== '' && v != null))
  return { kind: detectFileKind(headers, fileName), headers, rows }
}

/** Récupère une valeur de ligne en cherchant la colonne par motifs. */
function pick(row: Record<string, string>, ...patterns: string[]): string | undefined {
  const keys = Object.keys(row)
  for (const p of patterns) {
    const np = norm(p)
    const exact = keys.find((k) => norm(k) === np)
    if (exact) {
      const v = row[exact]
      if (v !== undefined && v !== '') return v
    }
  }
  for (const p of patterns) {
    const np = norm(p)
    const partial = keys.find((k) => norm(k).includes(np))
    if (partial) {
      const v = row[partial]
      if (v !== undefined && v !== '') return v
    }
  }
  return undefined
}

function num(v?: string): number | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const cleaned = String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-+eE]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return undefined
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/** Décalage horaire WHOOP : `+02:00`, `UTC+02:00`, `GMT-5`, `Europe/Paris`. */
function offsetFrom(tz?: string): string | null {
  if (!tz) return null
  const m = /([+-])\s*(\d{1,2}):?(\d{2})?/.exec(tz)
  if (!m) return null
  const sign = m[1]
  const hh = String(Number(m[2])).padStart(2, '0')
  const mm = m[3] ?? '00'
  return `${sign}${hh}:${mm}`
}

/**
 * Analyse une date WHOOP. Formats acceptés :
 *   2025-04-02 06:12:34 · 2025-04-02T06:12:34.000Z · 02/04/2025 06:12
 * Le fuseau de la colonne « Cycle timezone » est appliqué si présent.
 */
export function parseWhoopDate(raw?: string, tz?: string): Date | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s.replace(' ', 'T'))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (iso) {
    const off = offsetFrom(tz)
    const base = `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6] ?? '00'}`
    const d = new Date(off ? `${base}${off}` : base)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s)
  if (dmy) {
    const d = new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] ?? 0),
      Number(dmy[5] ?? 0),
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/* ── Activités WHOOP → types de séance Soma ───────────────────────────── */

interface ActivityMap {
  kind: WorkoutKind
  modality?: string
  mix?: MuscleMix
}

const ACTIVITY_MAP: { match: RegExp; to: ActivityMap }[] = [
  { match: /run|jog|trail/, to: { kind: 'course', mix: RUN_MIX } },
  { match: /walk|march/, to: { kind: 'cardio', modality: 'marche' } },
  { match: /hik|rando/, to: { kind: 'cardio', modality: 'randonnee' } },
  { match: /cycl|bike|velo|spin/, to: { kind: 'cardio', modality: 'velo' } },
  { match: /swim|natation/, to: { kind: 'cardio', modality: 'natation' } },
  { match: /row/, to: { kind: 'cardio', modality: 'rameur' } },
  { match: /ellipt/, to: { kind: 'cardio', modality: 'elliptique' } },
  { match: /jump.?rope|corde/, to: { kind: 'cardio', modality: 'corde_a_sauter' } },
  { match: /climb|escalade|boulder/, to: { kind: 'cardio', modality: 'escalade' } },
  { match: /box|mma|martial/, to: { kind: 'cardio', modality: 'boxe' } },
  { match: /yoga|pilates|stretch|mobilit/, to: { kind: 'mobilite' } },
  {
    match: /weight|strength|powerlift|lifting|musculation/,
    to: { kind: 'muscu', mix: KIND_FALLBACK_MIX.muscu },
  },
  {
    match: /functional|crossfit|hiit|circuit|calisthen|street/,
    to: { kind: 'street', mix: KIND_FALLBACK_MIX.street },
  },
  { match: /core|abdo|plank/, to: { kind: 'abdos', mix: KIND_FALLBACK_MIX.abdos } },
]

export function mapActivity(name?: string): ActivityMap {
  const n = (name ?? '').toLowerCase()
  for (const { match, to } of ACTIVITY_MAP) if (match.test(n)) return to
  return { kind: 'cardio', modality: 'autre' }
}

/* ── Conversion des lignes ────────────────────────────────────────────── */

function sleepFromRow(row: Record<string, string>, tz?: string) {
  const asleepMin = num(pick(row, 'Asleep duration (min)', 'asleep duration', 'sleep duration'))
  const inBedMin = num(pick(row, 'In bed duration (min)', 'in bed duration'))
  const onset = parseWhoopDate(pick(row, 'Sleep onset', 'sleep start', 'bedtime'), tz)
  const wake = parseWhoopDate(pick(row, 'Wake onset', 'sleep end', 'wake time'), tz)
  const perf = num(pick(row, 'Sleep performance %', 'sleep performance'))
  const light = num(pick(row, 'Light sleep duration (min)', 'light sleep'))
  const deep = num(pick(row, 'Deep (SWS) duration (min)', 'deep sws duration', 'deep sleep'))
  const rem = num(pick(row, 'REM duration (min)', 'rem duration', 'rem sleep'))
  const awake = num(pick(row, 'Awake duration (min)', 'awake duration'))
  const eff = num(pick(row, 'Sleep efficiency %', 'sleep efficiency'))
  const cons = num(pick(row, 'Sleep consistency %', 'sleep consistency'))
  const debt = num(pick(row, 'Sleep debt (min)', 'sleep debt'))

  const hours =
    asleepMin !== undefined
      ? asleepMin / 60
      : onset && wake
        ? (wake.getTime() - onset.getTime()) / 3_600_000
        : undefined
  if (
    hours === undefined &&
    perf === undefined &&
    light === undefined &&
    deep === undefined &&
    rem === undefined
  )
    return undefined

  return {
    hours,
    quality: perf,
    bedtime: onset ? (onset.toISOString() as Iso) : undefined,
    wakeTime: wake ? (wake.toISOString() as Iso) : undefined,
    lightMin: light,
    deepMin: deep,
    remMin: rem,
    awakeMin: awake,
    efficiency: eff,
    consistency: cons,
    debtMin: debt,
    inBedHours: inBedMin !== undefined ? inBedMin / 60 : undefined,
  }
}

function hrZoneMinutes(row: Record<string, string>, durationMin: number): HrZoneMinutes | undefined {
  const z: number[] = []
  for (let i = 1; i <= 5; i++) {
    const pct = num(pick(row, `HR Zone ${i} %`, `hr zone ${i}`, `zone ${i}`))
    z.push(pct === undefined ? 0 : (pct / 100) * durationMin)
  }
  if (z.every((v) => v === 0)) return undefined
  return z as unknown as HrZoneMinutes
}

/** Convertit une ligne `physiological_cycles.csv` en check-in. */
export function cycleRowToCheckIn(row: Record<string, string>): CheckIn | null {
  const tz = pick(row, 'Cycle timezone', 'timezone')
  const start = parseWhoopDate(pick(row, 'Cycle start time', 'cycle start'), tz)
  const wake = parseWhoopDate(pick(row, 'Wake onset'), tz)
  const anchor = start ?? wake
  if (!anchor) return null
  const day: DayKey = dayKey(anchor)
  const sleep = sleepFromRow(row, tz)
  const recovery = num(pick(row, 'Recovery score %', 'recovery score', 'recovery'))
  const rhr = num(pick(row, 'Resting heart rate (bpm)', 'resting heart rate'))
  const hrv = num(pick(row, 'Heart rate variability (ms)', 'heart rate variability', 'hrv'))
  const strain = num(pick(row, 'Day Strain', 'day strain', 'strain'))
  const rr = num(pick(row, 'Respiratory rate (rpm)', 'respiratory rate'))
  const spo2 = num(pick(row, 'Blood oxygen %', 'blood oxygen'))
  const skin = num(pick(row, 'Skin temp (celsius)', 'skin temp'))

  if (
    recovery === undefined &&
    rhr === undefined &&
    hrv === undefined &&
    strain === undefined &&
    !sleep
  )
    return null

  return {
    id: day,
    day,
    recovery: recovery !== undefined ? clamp(recovery, 0, 100) : undefined,
    restingHr: rhr,
    hrv,
    whoopDayStrain: strain !== undefined ? clamp(strain, 0, 21) : undefined,
    respiratoryRate: rr,
    spo2,
    skinTempC: skin,
    sleep,
    source: 'whoop',
    updatedAt: new Date().toISOString(),
  }
}

/** Convertit une ligne `sleeps.csv` en check-in partiel (sommeil seul). */
export function sleepRowToCheckIn(row: Record<string, string>): CheckIn | null {
  const tz = pick(row, 'Cycle timezone', 'timezone')
  const nap = (pick(row, 'Nap') ?? '').toLowerCase()
  if (nap === 'true' || nap === 'yes' || nap === 'oui') return null
  const wake = parseWhoopDate(pick(row, 'Wake onset', 'sleep end'), tz)
  const start = parseWhoopDate(pick(row, 'Cycle start time', 'cycle start'), tz)
  const anchor = wake ?? start
  if (!anchor) return null
  const sleep = sleepFromRow(row, tz)
  if (!sleep) return null
  const day = dayKey(anchor)
  return {
    id: day,
    day,
    sleep,
    source: 'whoop',
    updatedAt: new Date().toISOString(),
  }
}

/** Convertit une ligne `workouts.csv` en séance. */
export function workoutRowToWorkout(row: Record<string, string>): Workout | null {
  const tz = pick(row, 'Cycle timezone', 'timezone')
  const start =
    parseWhoopDate(pick(row, 'Workout start time', 'workout start'), tz) ??
    parseWhoopDate(pick(row, 'Cycle start time'), tz)
  if (!start) return null
  const end = parseWhoopDate(pick(row, 'Workout end time', 'workout end'), tz)
  let durationMin = num(pick(row, 'Duration (min)', 'duration'))
  if (durationMin === undefined && end) durationMin = (end.getTime() - start.getTime()) / 60000
  if (durationMin === undefined || durationMin <= 0) durationMin = 30

  const activity = pick(row, 'Activity name', 'activity')
  const mapped = mapActivity(activity)
  const strain = num(pick(row, 'Activity Strain', 'activity strain', 'strain'))
  const avgHr = num(pick(row, 'Average HR (bpm)', 'average hr'))
  const maxHr = num(pick(row, 'Max HR (bpm)', 'max hr'))
  const distance = num(pick(row, 'Distance (meters)', 'distance'))
  const gain = num(pick(row, 'Altitude Gain (meters)', 'altitude gain'))
  const change = num(pick(row, 'Altitude Change (meters)', 'altitude change'))
  const zones = hrZoneMinutes(row, durationMin)
  const startedAt = start.toISOString() as Iso

  const base: Workout = {
    id: `whoop_${start.getTime()}`,
    day: dayKey(start),
    startedAt,
    durationMin: Math.round(durationMin),
    kind: mapped.kind,
    title: activity || undefined,
    whoopStrain: strain !== undefined ? clamp(strain, 0, 21) : undefined,
    avgHr,
    maxHr,
    hrZoneMinutes: zones,
    source: 'whoop',
    externalKey: `whoop:${startedAt}`,
    updatedAt: new Date().toISOString(),
  }

  if (mapped.kind === 'course') {
    base.run = {
      runType: durationMin >= 70 ? 'sortie_longue' : 'footing',
      distanceM: distance,
      durationSec: Math.round(durationMin * 60),
      elevationGainM: gain,
      elevationLossM: change !== undefined && change < 0 ? Math.abs(change) : undefined,
      avgHr,
      maxHr,
    }
    base.fallbackMix = RUN_MIX
  } else if (mapped.modality) {
    base.cardio = { modality: mapped.modality, distanceM: distance, avgHr, maxHr }
    base.fallbackMix = CARDIO_MIX[mapped.modality] ?? CARDIO_MIX.autre
  } else {
    base.fallbackMix = mapped.mix ?? KIND_FALLBACK_MIX[mapped.kind]
  }
  return base
}

/** Convertit `journal_entries.csv` en notes de check-in. */
export function journalRowsToNotes(rows: Record<string, string>[]): Map<DayKey, string> {
  const out = new Map<DayKey, string>()
  for (const row of rows) {
    const tz = pick(row, 'Cycle timezone', 'timezone')
    const d = parseWhoopDate(pick(row, 'Cycle start time', 'cycle start'), tz)
    if (!d) continue
    const q = pick(row, 'Question text', 'question')
    const a = pick(row, 'Answered yes', 'answer')
    if (!q) continue
    const yes = (a ?? '').toLowerCase()
    const label = `${q} : ${yes === 'true' || yes === 'yes' ? 'oui' : yes === 'false' || yes === 'no' ? 'non' : (a ?? '')}`
    const day = dayKey(d)
    out.set(day, [out.get(day), label].filter(Boolean).join(' · '))
  }
  return out
}

/* ── Agrégation & dédoublonnage ───────────────────────────────────────── */

/** Fusionne deux entrées de sommeil (la plus détaillée gagne champ par champ). */
function mergeSleep(a?: CheckIn['sleep'], b?: CheckIn['sleep']): CheckIn['sleep'] {
  if (!a) return b
  if (!b) return a
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (v !== undefined && (out as Record<string, unknown>)[k] === undefined) {
      ;(out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

export interface WhoopFileInput {
  name: string
  text: string
}

/**
 * Construit l'aperçu d'import.
 * `existing` sert au dédoublonnage : les saisies manuelles ne sont jamais
 * écrasées, et un ré-import ne crée aucun doublon.
 */
export function buildWhoopPreview(
  files: WhoopFileInput[],
  existing: { checkins: CheckIn[]; workouts: Workout[] },
): WhoopImportPreview {
  const warnings: string[] = []
  const filesRead: WhoopImportPreview['filesRead'] = []
  const dayMap = new Map<DayKey, CheckIn>()
  const workoutMap = new Map<string, Workout>()
  let nights = 0
  let skippedDuplicates = 0

  const existingWorkoutKeys = new Set(
    existing.workouts.filter((w) => !w.deleted).map((w) => w.externalKey ?? `id:${w.id}`),
  )
  const existingByDay = new Map<DayKey, CheckIn>()
  for (const c of existing.checkins) if (!c.deleted) existingByDay.set(c.day, c)

  let journalNotes = new Map<DayKey, string>()

  for (const file of files) {
    let parsed: ParsedRows
    try {
      parsed = parseCsv(file.text, file.name)
    } catch {
      warnings.push(`${file.name} : fichier illisible, ignoré.`)
      continue
    }
    filesRead.push({ name: file.name, rows: parsed.rows.length, kind: parsed.kind })
    if (parsed.kind === 'unknown') {
      warnings.push(`${file.name} : type non reconnu, ignoré.`)
      continue
    }

    if (parsed.kind === 'cycles' || parsed.kind === 'sleeps') {
      for (const row of parsed.rows) {
        const c = parsed.kind === 'cycles' ? cycleRowToCheckIn(row) : sleepRowToCheckIn(row)
        if (!c) continue
        const prev = dayMap.get(c.day)
        if (prev) {
          dayMap.set(c.day, {
            ...prev,
            ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)),
            sleep: mergeSleep(prev.sleep, c.sleep),
          } as CheckIn)
        } else {
          dayMap.set(c.day, c)
        }
        if (c.sleep) nights += 1
      }
    } else if (parsed.kind === 'workouts') {
      for (const row of parsed.rows) {
        const w = workoutRowToWorkout(row)
        if (!w) continue
        const key = w.externalKey!
        if (existingWorkoutKeys.has(key) || workoutMap.has(key)) {
          skippedDuplicates += 1
          continue
        }
        workoutMap.set(key, w)
      }
    } else if (parsed.kind === 'journal') {
      journalNotes = journalRowsToNotes(parsed.rows)
    }
  }

  /* Les saisies manuelles gagnent toujours : on ne remplit que les trous. */
  const days: CheckIn[] = []
  for (const [day, incoming] of dayMap) {
    const note = journalNotes.get(day)
    const withNote = note ? { ...incoming, notes: [incoming.notes, note].filter(Boolean).join(' · ') } : incoming
    const prev = existingByDay.get(day)
    if (!prev) {
      days.push(withNote)
      continue
    }
    if (prev.source === 'manual') {
      const merged = { ...prev } as unknown as Record<string, unknown>
      let changed = false
      for (const [k, v] of Object.entries(withNote)) {
        if (k === 'id' || k === 'day' || k === 'source' || k === 'updatedAt') continue
        if (v === undefined) continue
        if (merged[k] === undefined) {
          merged[k] = v
          changed = true
        }
      }
      if (prev.sleep && withNote.sleep) {
        merged.sleep = mergeSleep(prev.sleep, withNote.sleep)
        changed = true
      }
      if (changed) {
        merged.updatedAt = new Date().toISOString()
        days.push(merged as unknown as CheckIn)
      } else {
        skippedDuplicates += 1
      }
    } else {
      days.push({ ...prev, ...withNote, updatedAt: new Date().toISOString() })
    }
  }

  const nightCount = [...dayMap.values()].filter((c) => !!c.sleep).length
  return {
    days: days.sort((a, b) => a.day.localeCompare(b.day)),
    workouts: [...workoutMap.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    nights: nightCount || nights,
    filesRead,
    skippedDuplicates,
    warnings,
  }
}
