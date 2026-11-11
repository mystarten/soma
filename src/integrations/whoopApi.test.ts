import { describe, expect, it } from 'vitest'
import { buildWhoopPreview } from '../engine/whoop'
import { apiToFiles } from './whoopApi'

const DATA = {
  cycles: [{ id: 1, start: '2026-11-10T06:30:00.000Z', score: { strain: 12.4 } }],
  recovery: [{ cycle_id: 1, score: { recovery_score: 71, resting_heart_rate: 52, hrv_rmssd_milli: 64.2, spo2_percentage: 97 } }],
  sleep: [
    { id: 's1', start: '2026-11-09T22:40:00.000Z', end: '2026-11-10T06:30:00.000Z', nap: false, score: { sleep_performance_percentage: 88, stage_summary: { total_in_bed_time_milli: 28_200_000, total_awake_time_milli: 1_800_000, total_light_sleep_time_milli: 13_000_000, total_slow_wave_sleep_time_milli: 6_000_000, total_rem_sleep_time_milli: 7_000_000 } } },
    { id: 's2', start: '2026-11-10T13:00:00.000Z', end: '2026-11-10T13:30:00.000Z', nap: true, score: {} },
  ],
  workouts: [{ id: 'w1', start: '2026-11-10T17:00:00.000Z', end: '2026-11-10T17:50:00.000Z', sport_name: 'Weightlifting', score: { strain: 9.1, average_heart_rate: 128, max_heart_rate: 170, zone_durations: { zone_one_milli: 600000, zone_two_milli: 1200000, zone_three_milli: 900000, zone_four_milli: 300000, zone_five_milli: 0 } } }],
}

describe('API WHOOP → import existant', () => {
  const files = apiToFiles(DATA)
  it('produit les trois fichiers attendus', () => {
    expect(files.map((f) => f.name)).toEqual(['physiological_cycles.csv', 'sleeps.csv', 'workouts.csv'])
  })
  const preview = buildWhoopPreview(files, { checkins: [], workouts: [] })
  it('récupération, FC, VFC, strain et sommeil arrivent dans le check-in', () => {
    const day = preview.days[0]
    expect(day.recovery).toBe(71)
    expect(day.restingHr).toBe(52)
    expect(day.hrv).toBeCloseTo(64.2)
    expect(day.whoopDayStrain).toBeCloseTo(12.4)
    expect(day.sleep?.hours).toBeCloseTo(26_000_000 / 3_600_000, 1)
    expect(day.sleep?.quality).toBe(88)
  })
  it('la séance est reconnue avec sa strain et ses zones', () => {
    const w = preview.workouts[0]
    expect(w.kind).toBe('muscu')
    expect(w.whoopStrain).toBeCloseTo(9.1)
    expect(w.durationMin).toBe(50)
    expect(w.hrZoneMinutes?.length).toBe(5)
  })
  it('une sieste n’écrase pas la nuit', () => {
    expect(preview.nights).toBeGreaterThan(0)
    expect(preview.days).toHaveLength(1)
  })
  it('un ré-import ne crée pas de doublon', () => {
    const again = buildWhoopPreview(files, { checkins: [], workouts: preview.workouts })
    expect(again.workouts).toHaveLength(0)
  })
  it('sans données : aucun fichier', () => {
    expect(apiToFiles({})).toEqual([])
  })
})
