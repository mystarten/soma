import type { WhoopFileInput } from '../engine/whoop'

/* Convertit les réponses de l'API WHOOP (recovery, sommeil, cycles, séances) en fichiers CSV équivalents
   à l'export WHOOP : l'import existant s'en charge ensuite, avec le même dédoublonnage et la même règle
   « les saisies manuelles ne sont jamais écrasées ». */

interface Rec {
  [k: string]: unknown
}
const o = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {})
const n = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const s = (v: unknown): string => (typeof v === 'string' ? v : '')

const cell = (v: unknown): string => {
  const t = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
const csv = (head: string[], rows: unknown[][]) => [head.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n')
const min = (milli?: number) => (milli === undefined ? '' : Math.round((milli / 60000) * 10) / 10)

/**
 * Un cycle WHOOP commence à l'endormissement : son début tombe donc le soir, la veille du jour où l'on
 * voit sa récupération. Le jour d'une mesure est celui du réveil : un début de cycle en soirée est
 * ramené au lendemain.
 */
export function wakeDayAnchor(iso: string): string {
  const d = new Date(iso)
  return d.getHours() >= 15 ? new Date(d.getTime() + 12 * 3_600_000).toISOString() : iso
}

export interface WhoopApiData {
  recovery?: unknown[]
  sleep?: unknown[]
  cycles?: unknown[]
  workouts?: unknown[]
}

export function apiToFiles(d: WhoopApiData): WhoopFileInput[] {
  const files: WhoopFileInput[] = []

  /* La récupération est rattachée à un cycle (cycle_id) et à une nuit (sleep_id). Le jour vient du réveil :
     on prend le début du cycle s'il est connu, sinon la fin de la nuit liée, sinon la date de la mesure.
     Ainsi la récupération arrive même si l'API ne renvoie aucun cycle. */
  const cycleById = new Map<string, Rec>()
  for (const c of d.cycles ?? []) {
    const cy = o(c)
    if (cy.id !== undefined) cycleById.set(String(cy.id), cy)
  }
  const sleepById = new Map<string, Rec>()
  for (const x of d.sleep ?? []) {
    const sl = o(x)
    if (sl.id !== undefined) sleepById.set(String(sl.id), sl)
  }
  const cycleRows: unknown[][] = []
  const usedCycles = new Set<string>()
  for (const r of d.recovery ?? []) {
    const rec = o(r)
    const rc = o(rec.score)
    if (n(rc.recovery_score) === undefined) continue /* mesure non calculée */
    const cy = cycleById.get(String(rec.cycle_id)) ?? {}
    const night = sleepById.get(String(rec.sleep_id)) ?? {}
    /* Le jour de la récupération est celui du réveil (fin de la nuit liée), pas le début du cycle. */
    const start = s(night.end) || s(rec.created_at) || (s(cy.start) ? wakeDayAnchor(s(cy.start)) : '') || s(rec.updated_at)
    if (!start) continue
    if (rec.cycle_id !== undefined) usedCycles.add(String(rec.cycle_id))
    cycleRows.push([
      start, '', n(rc.recovery_score), n(rc.resting_heart_rate), n(rc.hrv_rmssd_milli),
      n(o(cy.score).strain), n(rc.respiratory_rate), n(rc.spo2_percentage), n(rc.skin_temp_celsius),
    ])
  }
  /* Cycles sans récupération : on garde au moins la strain du jour. */
  for (const [id, cy] of cycleById) {
    if (usedCycles.has(id) || !s(cy.start)) continue
    cycleRows.push([wakeDayAnchor(s(cy.start)), '', undefined, undefined, undefined, n(o(cy.score).strain), undefined, undefined, undefined])
  }
  if (cycleRows.length) {
    files.push({
      name: 'physiological_cycles.csv',
      text: csv(
        ['Cycle start time', 'Cycle timezone', 'Recovery score %', 'Resting heart rate (bpm)', 'Heart rate variability (ms)', 'Day Strain', 'Respiratory rate (rpm)', 'Blood oxygen %', 'Skin temp (celsius)'],
        cycleRows,
      ),
    })
  }

  const sleepRows = (d.sleep ?? []).flatMap((x) => {
    const sl = o(x)
    if (!s(sl.start) || !s(sl.end)) return []
    const st = o(o(sl.score).stage_summary)
    const light = n(st.total_light_sleep_time_milli)
    const deep = n(st.total_slow_wave_sleep_time_milli)
    const rem = n(st.total_rem_sleep_time_milli)
    const asleep = (light ?? 0) + (deep ?? 0) + (rem ?? 0)
    return [[
      s(sl.start), s(sl.end), sl.nap ? 'true' : 'false', asleep ? min(asleep) : '', min(n(st.total_in_bed_time_milli)),
      n(o(sl.score).sleep_performance_percentage), min(light), min(deep), min(rem), min(n(st.total_awake_time_milli)),
      n(o(sl.score).sleep_efficiency_percentage),
    ]]
  })
  if (sleepRows.length) {
    files.push({
      name: 'sleeps.csv',
      text: csv(
        ['Sleep onset', 'Wake onset', 'Nap', 'Asleep duration (min)', 'In bed duration (min)', 'Sleep performance %', 'Light sleep duration (min)', 'Deep (SWS) duration (min)', 'REM duration (min)', 'Awake duration (min)', 'Sleep efficiency %'],
        sleepRows,
      ),
    })
  }

  const workoutRows = (d.workouts ?? []).flatMap((x) => {
    const w = o(x)
    if (!s(w.start) || !s(w.end)) return []
    const sc = o(w.score)
    const z = o(sc.zone_durations)
    const zones = ['zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli'].map((k) => n(z[k]) ?? 0)
    const total = zones.reduce((a, b) => a + b, 0) + (n(z.zone_zero_milli) ?? 0)
    const dur = (Date.parse(s(w.end)) - Date.parse(s(w.start))) / 60000
    return [[
      s(w.start), s(w.end), Math.round(dur * 10) / 10, s(w.sport_name) || (w.sport_id !== undefined ? `sport ${w.sport_id}` : 'Activité'),
      n(sc.strain), n(sc.average_heart_rate), n(sc.max_heart_rate), n(sc.distance_meter),
      ...zones.map((v) => (total ? Math.round((v / total) * 1000) / 10 : '')),
    ]]
  })
  if (workoutRows.length) {
    files.push({
      name: 'workouts.csv',
      text: csv(
        ['Workout start time', 'Workout end time', 'Duration (min)', 'Activity name', 'Activity Strain', 'Average HR (bpm)', 'Max HR (bpm)', 'Distance (meters)', 'HR Zone 1 %', 'HR Zone 2 %', 'HR Zone 3 %', 'HR Zone 4 %', 'HR Zone 5 %'],
        workoutRows,
      ),
    })
  }
  return files
}
