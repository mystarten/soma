import type { EmomSpec, Prescription } from '../types'

/* Prescriptions structurées (programme importé en JSON) : conversion vers les séries, texte lisible, et JSON. */

export interface PlannedSetLike {
  reps?: number
  loadKg?: number
  holdSec?: number
  distanceM?: number
  workSec?: number
  label?: string
  emom?: EmomSpec
  restSec?: number
  note?: string
}
export interface PlannedCellLike {
  rest: boolean
  test: boolean
  sets: PlannedSetLike[]
  text: string
}

const fmtPace = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/** Texte court d'une prescription : celui qu'on voit dans le tableau et dans l'éditeur. */
export function describePrescription(p: Prescription): string {
  switch (p.kind) {
    case 'rest':
      return 'repos'
    case 'test':
      return `TEST${p.note ? ` ${p.note}` : ''}`
    case 'distance':
      return `${p.rounds} × ${p.distanceM} m${p.paceSecPer500 ? ` (${fmtPace(p.paceSecPer500)} /500 m)` : ''}`
    case 'emom':
      return `EMOM ${p.minutes} min : ${p.items.map((i) => `${i.name ?? 'exercice'} ${i.reps}`).join(' / ')}`
    case 'pyramid':
      return `Pyramide ${p.steps.join('-')} : ${p.first} + ${p.second} ×${p.ratio}`
    case 'series': {
      const s = p.series
      if (!s.length) return ''
      const a = s[0]
      const same = s.every((x) => x.reps === a.reps && x.holdSec === a.holdSec && x.loadKg === a.loadKg)
      const one = (x: (typeof s)[number]) => `${x.holdSec ? `${x.holdSec} s` : x.reps ?? x.distanceM ?? '?'}${x.loadKg ? ` +${x.loadKg} kg` : ''}`
      return same ? `${s.length} x ${a.holdSec ? `${a.holdSec} s` : (a.reps ?? a.distanceM ?? '?')}${a.loadKg ? ` +${a.loadKg} kg` : ''}` : s.map(one).join(' - ')
    }
  }
}

/** La prescription, vue comme une case de programme (séries prêtes pour la séance). */
export function prescriptionToCell(p: Prescription): PlannedCellLike {
  const text = describePrescription(p)
  const base = { rest: false, test: false, text }
  switch (p.kind) {
    case 'rest':
      return { ...base, rest: true, sets: [] }
    case 'test':
      return { ...base, test: true, sets: [{ note: p.note }] }
    case 'distance': {
      const workSec = p.paceSecPer500 ? Math.round((p.distanceM / 500) * p.paceSecPer500) : undefined
      return { ...base, sets: Array.from({ length: p.rounds }, () => ({ distanceM: p.distanceM, workSec, note: p.note ?? (p.paceSecPer500 ? `allure ${fmtPace(p.paceSecPer500)} / 500 m` : undefined) })) }
    }
    case 'emom':
      return { ...base, sets: [{ emom: { minutes: p.minutes, items: p.items.map((i) => ({ name: i.name, reps: i.reps })) }, workSec: p.minutes * 60, note: `EMOM ${p.minutes} min` }] }
    case 'pyramid':
      return {
        ...base,
        /* Chaque paire est enchaînée sans repos, puis le repos de la pyramide. */
        sets: p.steps.flatMap((reps): PlannedSetLike[] => [
          { reps, label: p.first, restSec: 0 },
          { reps: Math.round(reps * p.ratio), label: p.second, restSec: p.restSec },
        ]),
      }
    case 'series':
      return { ...base, sets: p.series.map((x) => ({ ...x })) }
  }
}

/* ── JSON (snake_case, pour l'IA) ───────────────────────────────────── */

type Raw = Record<string, unknown>
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
const pick = (o: Raw, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Lit une prescription JSON. Renvoie une chaîne (texte libre, lu comme avant), une prescription, null (repos) ou une erreur. */
export function normalizePrescription(raw: unknown): Prescription | string | null | { error: string } {
  if (raw === null || raw === undefined || raw === 'rest' || raw === 'repos') return null
  if (typeof raw === 'string') return raw
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'une semaine doit être un texte, null, ou un objet (sets, series, emom, pyramid…)' }
  const o = raw as Raw
  const restSec = num(pick(o, 'rest_sec', 'restSec'))

  if (o.emom && typeof o.emom === 'object') {
    const e = o.emom as Raw
    const minutes = num(e.minutes)
    const items = pick(e, 'minute_items', 'items', 'alternate')
    if (!minutes || minutes < 1) return { error: 'emom.minutes doit être un nombre de minutes (ex. 18)' }
    if (!Array.isArray(items) || !items.length) return { error: 'emom.minute_items doit lister un ou deux exercices : [{"exercise":"Tractions","reps":11},{"exercise":"Pompes","reps":20}]' }
    const parsed: { name?: string; reps: number }[] = []
    for (const it of items as Raw[]) {
      const reps = num(it?.reps)
      if (!reps) return { error: 'chaque élément de emom.minute_items a besoin de "reps"' }
      parsed.push({ name: text(pick(it, 'exercise', 'name')), reps })
    }
    return { kind: 'emom', minutes, items: parsed }
  }

  if (o.pyramid && typeof o.pyramid === 'object') {
    const pr = o.pyramid as Raw
    const steps = Array.isArray(pr.steps) ? (pr.steps as unknown[]).map(num) : []
    if (!steps.length || steps.some((x) => !x)) return { error: 'pyramid.steps doit être une liste de nombres (ex. [5,10,15,22,15,10,5])' }
    const first = text(pr.first)
    const second = text(pr.second)
    if (!first || !second) return { error: 'pyramid.first et pyramid.second doivent nommer les deux exercices' }
    return { kind: 'pyramid', steps: steps as number[], first, second, ratio: num(pick(pr, 'second_ratio', 'ratio')) ?? 2, restSec: num(pick(pr, 'rest_between_pairs_sec', 'rest_sec')) ?? 90 }
  }

  if (o.test !== undefined) return { kind: 'test', note: text(o.test) }

  if (pick(o, 'distance_m', 'distanceM') !== undefined) {
    const distanceM = num(pick(o, 'distance_m', 'distanceM'))
    if (!distanceM) return { error: 'distance_m doit être un nombre de mètres' }
    return { kind: 'distance', rounds: num(o.rounds) ?? 1, distanceM, paceSecPer500: num(pick(o, 'pace_sec_per_500m', 'paceSecPer500')), note: text(o.note) }
  }

  if (Array.isArray(o.series)) {
    const series = (o.series as Raw[]).map((x) => ({
      reps: num(x?.reps),
      holdSec: num(pick(x ?? {}, 'hold_sec', 'holdSec')),
      loadKg: num(pick(x ?? {}, 'load_kg', 'loadKg')),
      distanceM: num(pick(x ?? {}, 'distance_m', 'distanceM')),
      restSec: num(pick(x ?? {}, 'rest_sec', 'restSec')),
      note: text(x?.note),
    }))
    if (!series.length || series.some((x) => !x.reps && !x.holdSec && !x.distanceM)) return { error: 'chaque élément de series a besoin de reps, hold_sec ou distance_m' }
    return { kind: 'series', series }
  }

  if (o.sets !== undefined) {
    const sets = num(o.sets)
    const reps = num(o.reps)
    const holdSec = num(pick(o, 'hold_sec', 'holdSec'))
    if (!sets || sets < 1 || (!reps && !holdSec)) return { error: '"sets" doit être accompagné de "reps" ou de "hold_sec" (ex. {"sets":4,"reps":8,"load_kg":20})' }
    const one = { reps, holdSec, loadKg: num(pick(o, 'load_kg', 'loadKg')), restSec, note: text(o.note) }
    return { kind: 'series', series: Array.from({ length: sets }, () => ({ ...one })) }
  }

  return { error: 'prescription non reconnue : utilise sets, series, emom, pyramid, distance_m ou test' }
}

/** Version JSON (snake_case) d'une prescription, pour l'export et l'IA. */
export function prescriptionToJson(p: Prescription): unknown {
  switch (p.kind) {
    case 'rest':
      return null
    case 'test':
      return { test: p.note ?? 'test' }
    case 'distance':
      return { rounds: p.rounds, distance_m: p.distanceM, ...(p.paceSecPer500 ? { pace_sec_per_500m: p.paceSecPer500 } : {}), ...(p.note ? { note: p.note } : {}) }
    case 'emom':
      return { emom: { minutes: p.minutes, minute_items: p.items.map((i) => ({ ...(i.name ? { exercise: i.name } : {}), reps: i.reps })) } }
    case 'pyramid':
      return { pyramid: { steps: p.steps, first: p.first, second: p.second, second_ratio: p.ratio, rest_between_pairs_sec: p.restSec } }
    case 'series': {
      return { series: p.series.map((x) => ({ ...(x.reps ? { reps: x.reps } : {}), ...(x.holdSec ? { hold_sec: x.holdSec } : {}), ...(x.loadKg ? { load_kg: x.loadKg } : {}), ...(x.distanceM ? { distance_m: x.distanceM } : {}), ...(x.restSec !== undefined ? { rest_sec: x.restSec } : {}), ...(x.note ? { note: x.note } : {}) })) }
    }
  }
}
