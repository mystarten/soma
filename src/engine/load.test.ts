import { describe, expect, it } from 'vitest'
import { dayLoad, dayLoadSeries, exerciseRecords, loadBalance, runRecords, volumeSummary } from './load'
import { epley1RM, estimated1RM, repsAtLoad, riegelProjection, setEffort } from './strength'
import { EXERCISES, makeCheckIn, makeSet, makeWorkout } from '../test/fixtures'
import { DEFAULT_FATIGUE_CONFIG } from './fatigueConfig'
import type { CheckIn } from '../types'

const lctx = { exercises: EXERCISES, bodyWeightKg: 70 }

describe('charge d’entraînement', () => {
  it('reste dans 0 → 21 et croît avec la durée et le RPE', () => {
    const easy = makeWorkout({ day: '2025-06-02', durationMin: 30, rpe: 4, kind: 'cardio' })
    const hard = makeWorkout({ day: '2025-06-02', durationMin: 90, rpe: 9, kind: 'cardio' })
    const a = dayLoad('2025-06-02', [easy], new Map(), lctx).load
    const b = dayLoad('2025-06-02', [hard], new Map(), lctx).load
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThanOrEqual(21)
  })

  it('une séance de 60 min à RPE 8 avec 10 séries tombe dans la plage 11 → 16', () => {
    const w = makeWorkout({
      day: '2025-06-02',
      durationMin: 60,
      rpe: 8,
      sets: Array.from({ length: 10 }, () => makeSet('ex_tractions_pronation', { reps: 18 })),
    })
    const load = dayLoad('2025-06-02', [w], new Map(), lctx).load
    expect(load).toBeGreaterThan(11)
    expect(load).toBeLessThan(16)
  })

  it('un jour sans séance vaut 0', () => {
    expect(dayLoad('2025-06-02', [], new Map(), lctx).load).toBe(0)
  })

  it('le Day Strain WHOOP prend le dessus quand il est importé', () => {
    const map = new Map<string, CheckIn>([
      ['2025-06-02', makeCheckIn('2025-06-02', { whoopDayStrain: 16.4, source: 'whoop' })],
    ])
    const w = makeWorkout({ day: '2025-06-02', durationMin: 20, rpe: 3 })
    expect(dayLoad('2025-06-02', [w], map, lctx).load).toBeCloseTo(16.4)
  })

  it('calcule le ratio charge aiguë / chronique', () => {
    const workouts = []
    /* 4 semaines régulières, puis une semaine deux fois plus chargée. */
    for (let i = 27; i >= 7; i -= 2) {
      const day = new Date(2025, 5, 30 - i)
      workouts.push(
        makeWorkout({
          day: day.toISOString().slice(0, 10),
          startedAt: `${day.toISOString().slice(0, 10)}T18:00:00.000Z`,
          durationMin: 45,
          rpe: 6,
          kind: 'cardio',
        }),
      )
    }
    for (let i = 6; i >= 0; i--) {
      const day = new Date(2025, 5, 30 - i)
      workouts.push(
        makeWorkout({
          day: day.toISOString().slice(0, 10),
          startedAt: `${day.toISOString().slice(0, 10)}T18:00:00.000Z`,
          durationMin: 90,
          rpe: 8,
          kind: 'cardio',
        }),
      )
    }
    const b = loadBalance('2025-06-30', workouts, [], lctx)
    expect(b.acute7).toBeGreaterThan(b.chronic28)
    expect(b.ratio).toBeGreaterThan(1.2)
  })

  it('produit une série de charges sur une plage de jours', () => {
    const series = dayLoadSeries('2025-06-01', '2025-06-07', [], [], lctx)
    expect(series).toHaveLength(7)
    expect(series.every((d) => d.load === 0)).toBe(true)
  })
})

describe('volumes et records', () => {
  it('additionne reps, tonnage et kilomètres', () => {
    const strength = makeWorkout({
      sets: [
        makeSet('ex_tractions_lestees', { reps: 6, loadKg: 20 }),
        makeSet('ex_tractions_lestees', { reps: 5, loadKg: 20 }),
      ],
    })
    const run = makeWorkout({
      kind: 'course',
      durationMin: 50,
      run: { runType: 'footing', distanceM: 10000, durationSec: 3000, elevationGainM: 120 },
    })
    const v = volumeSummary([strength, run], lctx)
    expect(v.sessions).toBe(2)
    expect(v.reps).toBe(11)
    expect(v.km).toBeCloseTo(10)
    expect(v.elevationM).toBe(120)
    expect(v.tonnage).toBeCloseTo(11 * 90)
  })

  it('détecte reps max, lest max et 1RM estimé', () => {
    const w1 = makeWorkout({ sets: [makeSet('ex_tractions_lestees', { reps: 10, loadKg: 10 })] })
    const w2 = makeWorkout({ sets: [makeSet('ex_tractions_lestees', { reps: 3, loadKg: 32 })] })
    const rec = exerciseRecords('ex_tractions_lestees', [w1, w2], lctx)
    expect(rec.maxReps).toBe(10)
    expect(rec.maxLoadKg).toBe(32)
    expect(rec.best1RM).toBeCloseTo(epley1RM(102, 3), 3)
  })

  it('estime les records de course par distance', () => {
    const run = makeWorkout({
      day: '2025-06-02',
      kind: 'course',
      run: { runType: 'test', distanceM: 5000, durationSec: 1200 },
    })
    const recs = runRecords([run])
    const fiveK = recs.find((r) => r.distanceM === 5000)!
    expect(fiveK.durationSec).toBeCloseTo(1200)
    expect(recs.find((r) => r.distanceM === 10000)).toBeUndefined()
  })
})

describe('force', () => {
  it('Epley et son inverse sont cohérents', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.33, 1)
    expect(repsAtLoad(133.33, 100)).toBeCloseTo(10, 1)
    expect(repsAtLoad(100, 120)).toBe(1)
    expect(epley1RM(0, 10)).toBe(0)
  })

  it('1RM estimé des tractions à partir de 31 reps strictes', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex_tractions_pronation')!
    const rm = estimated1RM(ex, { bodyWeightKg: 70, references: [] })
    expect(rm).toBeCloseTo(70 * (1 + 31 / 30), 2)
  })

  it('effort relatif : 18 reps sur 31 max ≈ 0,58, plafonné à 1,2', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex_tractions_pronation')!
    const ctx = { bodyWeightKg: 70, references: [] }
    const a = setEffort(ex, makeSet(ex.id, { reps: 18 }), ctx, 1.2, 1.25)
    expect(a.effort).toBeCloseTo(18 / 31, 2)
    const b = setEffort(ex, makeSet(ex.id, { reps: 60 }), ctx, 1.2, 1.25)
    expect(b.effort).toBeCloseTo(1.2, 5)
    const c = setEffort(ex, makeSet(ex.id, { reps: 31, failure: true }), ctx, 1.2, 1.25)
    expect(c.effort).toBeCloseTo(1.25, 2)
    expect(c.intensity).toBeCloseTo(1, 2)
  })

  it('effort d’un statique = tenue / record', () => {
    const ex = EXERCISES.find((e) => e.id === 'ex_lsit')!
    const r = setEffort(ex, makeSet(ex.id, { holdSec: 15 }), { bodyWeightKg: 70, references: [] }, 1.2, 1.25)
    expect(r.effort).toBeCloseTo(0.5, 3)
  })

  it('projection Riegel 5 km → 10 km', () => {
    const t = riegelProjection(5000, 1200, 10000)
    expect(t).toBeGreaterThan(2400)
    expect(t).toBeLessThan(2600)
  })

  it('les constantes par défaut restent dans des plages saines', () => {
    const c = DEFAULT_FATIGUE_CONFIG
    expect(c.tau.small).toBeLessThan(c.tau.medium)
    expect(c.tau.medium).toBeLessThan(c.tau.large)
    expect(c.sleepMultiplier.max).toBeGreaterThan(c.awakeMultiplier.max)
  })
})
