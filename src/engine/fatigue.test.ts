import { describe, expect, it } from 'vitest'
import { availabilityScore, bodySummary, fatigueAt, prepareFatigue } from './fatigue'
import { fatigueBand, fatigueColor, NEUTRAL_ZONE_COLOR } from './fatigueConfig'
import { badNight, ctx, goodNight, makeSet, makeWorkout } from '../test/fixtures'

/** Séance de tractions : 10 séries à ~60 % du max (31 reps strictes → 18). */
function pullSession(startedAt: string) {
  return makeWorkout({
    startedAt,
    day: startedAt.slice(0, 10),
    durationMin: 55,
    rpe: 8,
    sets: Array.from({ length: 10 }, () => makeSet('ex_tractions_pronation', { reps: 18 })),
  })
}

/** 100 pompes d'un coup, à l'échec (référence : 100 reps). */
function hundredPushups(startedAt: string) {
  return makeWorkout({
    startedAt,
    day: startedAt.slice(0, 10),
    durationMin: 10,
    rpe: 9,
    sets: [makeSet('ex_pompes', { reps: 100, failure: true })],
  })
}

describe('moteur de fatigue — calibrage', () => {
  it('10 × 18 tractions place le dos autour de 80', () => {
    const w = pullSession('2025-06-02T18:00:00.000Z')
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [w] }))
    expect(body.dorsaux.value).toBeGreaterThan(70)
    expect(body.dorsaux.value).toBeLessThan(92)
    expect(body.biceps.value).toBeGreaterThan(40)
    /* Les jambes ne sont pas touchées. */
    expect(body.quadriceps.hasHistory).toBe(false)
  })

  it('100 pompes à l’échec rendent pectoraux, triceps et deltoïdes antérieurs rouges ou presque', () => {
    const w = hundredPushups('2025-06-02T18:00:00.000Z')
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [w] }))
    expect(body.pectoraux.value).toBeGreaterThanOrEqual(90)
    expect(body.triceps.value).toBeGreaterThanOrEqual(75)
    expect(body.deltoides_ant.value).toBeGreaterThanOrEqual(70)
    expect(fatigueBand(body.pectoraux.value)).toBe('fatigue')
    /* Les abdos ne sont que secondaires. */
    expect(body.abdos.value).toBeLessThan(45)
  })

  it('une zone sans historique est neutre, pas verte', () => {
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [] }))
    expect(body.mollets.hasHistory).toBe(false)
    expect(fatigueColor(body.mollets.value, body.mollets.hasHistory)).toBe(NEUTRAL_ZONE_COLOR)
    expect(fatigueBand(0, false)).toBe('inconnu')
  })
})

describe('moteur de fatigue — récupération', () => {
  it('une bonne nuit fait davantage baisser la fatigue qu’une mauvaise', () => {
    const w = pullSession('2025-06-02T18:00:00.000Z')
    const at = '2025-06-03T12:00:00.000Z'
    const good = fatigueAt(at, ctx({ workouts: [w], checkins: [goodNight('2025-06-03')] }))
    const bad = fatigueAt(at, ctx({ workouts: [w], checkins: [badNight('2025-06-03')] }))
    expect(good.dorsaux.value).toBeLessThan(bad.dorsaux.value)
    expect(bad.dorsaux.value - good.dorsaux.value).toBeGreaterThan(3)
  })

  it('à durée écoulée égale, une séance à 21 h récupère plus vite qu’une séance à 8 h', () => {
    const night = goodNight('2025-06-03')
    const late = makeWorkout({
      startedAt: '2025-06-02T21:00:00.000Z',
      day: '2025-06-02',
      sets: Array.from({ length: 8 }, () => makeSet('ex_tractions_pronation', { reps: 15 })),
    })
    const early = makeWorkout({
      startedAt: '2025-06-02T08:00:00.000Z',
      day: '2025-06-02',
      sets: Array.from({ length: 8 }, () => makeSet('ex_tractions_pronation', { reps: 15 })),
    })
    const lateBody = fatigueAt(
      new Date('2025-06-03T09:00:00.000Z'),
      ctx({ workouts: [late], checkins: [night] }),
    )
    const earlyBody = fatigueAt(
      new Date('2025-06-02T20:00:00.000Z'),
      ctx({ workouts: [early], checkins: [night] }),
    )
    expect(lateBody.dorsaux.value).toBeLessThan(earlyBody.dorsaux.value)
  })

  it('la fatigue décroît de façon monotone après la séance', () => {
    const w = pullSession('2025-06-02T18:00:00.000Z')
    const c = ctx({ workouts: [w], checkins: [goodNight('2025-06-03'), goodNight('2025-06-04')] })
    const prepared = prepareFatigue(c, new Date('2025-06-02T18:00:00.000Z'))
    const t0 = new Date('2025-06-02T18:00:00.000Z').getTime()
    let prev = Infinity
    for (const h of [0, 6, 12, 24, 36, 48, 72]) {
      const v = fatigueAt(t0 + h * 3_600_000, c, prepared).dorsaux.value
      expect(v).toBeLessThanOrEqual(prev + 1e-9)
      prev = v
    }
    expect(prev).toBeLessThan(35)
  })

  it('le curseur temporel prévoit une baisse à +12 h, +24 h et +48 h', () => {
    const w = hundredPushups('2025-06-02T18:00:00.000Z')
    const c = ctx({ workouts: [w] })
    const t0 = new Date('2025-06-02T18:00:00.000Z').getTime()
    const prepared = prepareFatigue(c, t0)
    const now = fatigueAt(t0, c, prepared).pectoraux.value
    const in12 = fatigueAt(t0 + 12 * 3_600_000, c, prepared).pectoraux.value
    const in24 = fatigueAt(t0 + 24 * 3_600_000, c, prepared).pectoraux.value
    const in48 = fatigueAt(t0 + 48 * 3_600_000, c, prepared).pectoraux.value
    expect(in12).toBeLessThan(now)
    expect(in24).toBeLessThan(in12)
    expect(in48).toBeLessThan(in24)
    /* Une séance maximale reste sensible 48 h plus tard : c'est voulu. */
    expect(in48).toBeLessThan(80)
  })

  it('le lendemain d’une séance normale + bonne nuit : jaune clair ; mauvaise nuit : plus haut', () => {
    const w = makeWorkout({
      startedAt: '2025-06-02T18:00:00.000Z',
      day: '2025-06-02',
      durationMin: 45,
      rpe: 7,
      sets: Array.from({ length: 5 }, () => makeSet('ex_tractions_pronation', { reps: 10 })),
    })
    const at = '2025-06-03T08:00:00.000Z'
    const good = fatigueAt(at, ctx({ workouts: [w], checkins: [goodNight('2025-06-03')] }))
    const bad = fatigueAt(at, ctx({ workouts: [w], checkins: [badNight('2025-06-03')] }))
    expect(fatigueBand(good.dorsaux.value)).toBe('frais') /* 15 → 35 : jaune clair */
    expect(bad.dorsaux.value).toBeGreaterThan(good.dorsaux.value)
  })

  it('remonter le temps avant la séance donne un corps vierge', () => {
    const w = pullSession('2025-06-02T18:00:00.000Z')
    const c = ctx({ workouts: [w] })
    const body = fatigueAt(new Date('2025-06-01T18:00:00.000Z'), c)
    expect(body.dorsaux.value).toBe(0)
  })

  it('estime un délai « prêt dans X h » cohérent', () => {
    const w = pullSession('2025-06-02T18:00:00.000Z')
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [w] }))
    expect(body.dorsaux.readyInHours).not.toBeNull()
    expect(body.dorsaux.readyInHours!).toBeGreaterThan(12)
    expect(body.dorsaux.readyInHours!).toBeLessThan(240)
  })
})

describe('moteur de fatigue — course et cardio', () => {
  it('un footing charge surtout les mollets, pas le dos', () => {
    const run = makeWorkout({
      startedAt: '2025-06-02T18:00:00.000Z',
      kind: 'course',
      durationMin: 60,
      rpe: 5,
      run: { runType: 'footing', distanceM: 11000, durationSec: 3600 },
    })
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [run] }))
    expect(body.mollets.value).toBeGreaterThan(body.dorsaux.value)
    expect(body.dorsaux.hasHistory).toBe(false)
    expect(body.mollets.value).toBeGreaterThan(15)
    expect(body.mollets.value).toBeLessThan(80)
  })

  it('le dénivelé négatif majore quadriceps et ischios', () => {
    const base = {
      startedAt: '2025-06-02T18:00:00.000Z',
      kind: 'course' as const,
      durationMin: 60,
      rpe: 6,
    }
    const flat = makeWorkout({
      ...base,
      run: { runType: 'sortie_longue', distanceM: 12000, durationSec: 3600 },
    })
    const down = makeWorkout({
      ...base,
      run: {
        runType: 'sortie_longue',
        distanceM: 12000,
        durationSec: 3600,
        elevationLossM: 800,
      },
    })
    const a = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [flat] })).quadriceps.value
    const b = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [down] })).quadriceps.value
    expect(b).toBeGreaterThan(a)
  })

  it('une séance WHOOP sans détail compte via durée, strain et type', () => {
    const w = makeWorkout({
      startedAt: '2025-06-02T18:00:00.000Z',
      kind: 'street',
      durationMin: 70,
      whoopStrain: 15,
      source: 'whoop',
      sets: [],
    })
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [w] }))
    expect(body.dorsaux.value).toBeGreaterThan(10)
    expect(body.pectoraux.value).toBeGreaterThan(10)
  })
})

describe('résumé du corps', () => {
  it('score de disponibilité à 100 sans aucune séance', () => {
    const body = fatigueAt(Date.now(), ctx())
    expect(availabilityScore(body)).toBe(100)
    expect(bodySummary(body).careful).toHaveLength(0)
  })

  it('liste les zones à ménager après une grosse séance de poussée', () => {
    const w = hundredPushups('2025-06-02T18:00:00.000Z')
    const body = fatigueAt('2025-06-02T18:00:00.000Z', ctx({ workouts: [w] }))
    const { ready, careful } = bodySummary(body)
    expect(careful).toContain('pectoraux')
    expect(careful).toContain('triceps')
    expect(ready).toContain('quadriceps')
    expect(availabilityScore(body)).toBeLessThan(95)
  })
})
