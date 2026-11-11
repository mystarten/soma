import { describe, expect, it } from 'vitest'
import {
  buildWhoopPreview,
  detectFileKind,
  mapActivity,
  parseCsv,
  parseWhoopDate,
} from './whoop'
import type { CheckIn, Workout } from '../types'

/* Fausses données au format de l'export WHOOP. */

const CYCLES = `Cycle start time,Cycle end time,Cycle timezone,Recovery score %,Resting heart rate (bpm),Heart rate variability (ms),Skin temp (celsius),Blood oxygen %,Day Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min),In bed duration (min),Light sleep duration (min),Deep (SWS) duration (min),REM duration (min),Awake duration (min),Sleep need (min),Sleep debt (min),Sleep efficiency %,Sleep consistency %
2025-03-10 07:05:00,2025-03-11 06:50:00,UTC+01:00,67,49,88,33.4,96,14.2,2890,176,112,2025-03-09 23:10:00,2025-03-10 07:02:00,84,14.2,445,478,230,98,117,33,520,65,93,81
2025-03-11 06:50:00,2025-03-12 07:00:00,UTC+01:00,41,55,61,33.6,95,17.8,3310,182,121,2025-03-10 01:20:00,2025-03-11 06:45:00,52,15.1,300,350,190,45,65,50,520,180,86,44
`

const SLEEPS = `Cycle start time,Cycle end time,Cycle timezone,Sleep onset,Wake onset,Sleep performance %,Respiratory rate (rpm),Asleep duration (min),In bed duration (min),Light sleep duration (min),Deep (SWS) duration (min),REM duration (min),Awake duration (min),Sleep need (min),Sleep debt (min),Sleep efficiency %,Sleep consistency %,Nap
2025-03-12 07:00:00,2025-03-13 07:00:00,UTC+01:00,2025-03-11 22:50:00,2025-03-12 06:55:00,91,13.9,470,495,240,110,120,25,515,30,95,88,false
2025-03-12 14:00:00,2025-03-12 14:40:00,UTC+01:00,2025-03-12 14:00:00,2025-03-12 14:40:00,20,13.5,38,40,30,4,4,2,515,30,95,88,true
`

const WORKOUTS = `Cycle start time,Cycle end time,Cycle timezone,Workout start time,Workout end time,Duration (min),Activity name,Activity Strain,Energy burned (cal),Max HR (bpm),Average HR (bpm),HR Zone 1 %,HR Zone 2 %,HR Zone 3 %,HR Zone 4 %,HR Zone 5 %,Distance (meters),Altitude Gain (meters),Altitude Change (meters),GPS Enabled
2025-03-10 07:05:00,2025-03-11 06:50:00,UTC+01:00,2025-03-10 18:12:00,2025-03-10 19:02:00,50,Running,11.4,540,181,152,10,20,40,25,5,10200,120,-80,true
2025-03-11 06:50:00,2025-03-12 07:00:00,UTC+01:00,2025-03-11 12:30:00,2025-03-11 13:35:00,65,Weightlifting,13.9,610,168,128,30,40,20,8,2,,,,false
`

const JOURNAL = `Cycle start time,Cycle end time,Cycle timezone,Question text,Answered yes,Notes
2025-03-10 07:05:00,2025-03-11 06:50:00,UTC+01:00,Have any caffeine?,true,
`

const empty = { checkins: [] as CheckIn[], workouts: [] as Workout[] }

describe('parseur WHOOP', () => {
  it('détecte le type de chaque fichier', () => {
    expect(parseCsv(CYCLES, 'physiological_cycles.csv').kind).toBe('cycles')
    expect(parseCsv(SLEEPS, 'sleeps.csv').kind).toBe('sleeps')
    expect(parseCsv(WORKOUTS, 'workouts.csv').kind).toBe('workouts')
    expect(parseCsv(JOURNAL, 'journal_entries.csv').kind).toBe('journal')
    expect(detectFileKind(['Colonne inconnue'], 'truc.csv')).toBe('unknown')
  })

  it('tolère les dates avec fuseau, sans fuseau et au format jour/mois', () => {
    expect(parseWhoopDate('2025-03-10 07:05:00', 'UTC+01:00')?.toISOString()).toBe(
      '2025-03-10T06:05:00.000Z',
    )
    expect(parseWhoopDate('2025-03-10T07:05:00.000Z')?.toISOString()).toBe(
      '2025-03-10T07:05:00.000Z',
    )
    expect(parseWhoopDate('10/03/2025 07:05')).not.toBeNull()
    expect(parseWhoopDate('')).toBeNull()
    expect(parseWhoopDate(undefined)).toBeNull()
  })

  it('mappe les activités WHOOP vers mes types de séance', () => {
    expect(mapActivity('Running').kind).toBe('course')
    expect(mapActivity('Weightlifting').kind).toBe('muscu')
    expect(mapActivity('Functional Fitness').kind).toBe('street')
    expect(mapActivity('Cycling').modality).toBe('velo')
    expect(mapActivity('Yoga').kind).toBe('mobilite')
    expect(mapActivity('Zorglub').kind).toBe('cardio')
  })

  it('importe jours, nuits et séances', () => {
    const p = buildWhoopPreview(
      [
        { name: 'physiological_cycles.csv', text: CYCLES },
        { name: 'sleeps.csv', text: SLEEPS },
        { name: 'workouts.csv', text: WORKOUTS },
        { name: 'journal_entries.csv', text: JOURNAL },
      ],
      empty,
    )
    expect(p.days.length).toBe(3)
    expect(p.workouts.length).toBe(2)
    expect(p.nights).toBe(3)
    expect(p.warnings).toHaveLength(0)

    const d10 = p.days.find((d) => d.day === '2025-03-10')!
    expect(d10.recovery).toBe(67)
    expect(d10.restingHr).toBe(49)
    expect(d10.hrv).toBe(88)
    expect(d10.whoopDayStrain).toBeCloseTo(14.2)
    expect(d10.sleep?.hours).toBeCloseTo(445 / 60)
    expect(d10.sleep?.deepMin).toBe(98)
    expect(d10.sleep?.efficiency).toBe(93)
    expect(d10.notes).toContain('caffeine')
    expect(d10.source).toBe('whoop')

    const run = p.workouts[0]
    expect(run.kind).toBe('course')
    expect(run.run?.distanceM).toBe(10200)
    expect(run.run?.elevationLossM).toBe(80)
    expect(run.hrZoneMinutes?.[3]).toBeCloseTo(12.5)
    expect(run.externalKey).toBe('whoop:2025-03-10T17:12:00.000Z')
  })

  it('ignore les siestes de sleeps.csv', () => {
    const p = buildWhoopPreview([{ name: 'sleeps.csv', text: SLEEPS }], empty)
    expect(p.days.length).toBe(1)
    expect(p.days[0].day).toBe('2025-03-12')
  })

  it('ne crée aucun doublon lors d’un ré-import', () => {
    const first = buildWhoopPreview(
      [
        { name: 'physiological_cycles.csv', text: CYCLES },
        { name: 'workouts.csv', text: WORKOUTS },
      ],
      empty,
    )
    const second = buildWhoopPreview(
      [
        { name: 'physiological_cycles.csv', text: CYCLES },
        { name: 'workouts.csv', text: WORKOUTS },
      ],
      { checkins: first.days, workouts: first.workouts },
    )
    expect(second.workouts).toHaveLength(0)
    expect(second.skippedDuplicates).toBe(2)
    /* Les jours déjà importés depuis WHOOP sont rafraîchis, pas dupliqués. */
    expect(new Set(second.days.map((d) => d.day)).size).toBe(second.days.length)
  })

  it('n’écrase jamais une saisie manuelle', () => {
    const manual: CheckIn = {
      id: '2025-03-10',
      day: '2025-03-10',
      recovery: 90,
      restingHr: 44,
      notes: 'ma note',
      source: 'manual',
      updatedAt: '2025-03-10T08:00:00.000Z',
    }
    const p = buildWhoopPreview([{ name: 'physiological_cycles.csv', text: CYCLES }], {
      checkins: [manual],
      workouts: [],
    })
    const d = p.days.find((x) => x.day === '2025-03-10')!
    expect(d.recovery).toBe(90)
    expect(d.restingHr).toBe(44)
    expect(d.source).toBe('manual')
    /* Les champs vides sont tout de même complétés. */
    expect(d.hrv).toBe(88)
    expect(d.sleep?.deepMin).toBe(98)
  })

  it('ignore les colonnes manquantes sans planter', () => {
    const minimal = `Cycle start time,Recovery score %
2025-04-01 07:00:00,55
`
    const p = buildWhoopPreview([{ name: 'cycles.csv', text: minimal }], empty)
    expect(p.days).toHaveLength(1)
    expect(p.days[0].recovery).toBe(55)
    expect(p.days[0].sleep).toBeUndefined()
  })

  it('signale un fichier non reconnu sans interrompre l’import', () => {
    const p = buildWhoopPreview(
      [
        { name: 'bidule.csv', text: 'a,b\n1,2\n' },
        { name: 'workouts.csv', text: WORKOUTS },
      ],
      empty,
    )
    expect(p.warnings).toHaveLength(1)
    expect(p.workouts).toHaveLength(2)
  })
})

describe('séances supprimées', () => {
  it('un ré-import ne ressuscite pas une séance supprimée', () => {
    const csv = 'Workout start time,Workout end time,Duration (min),Activity name,Activity Strain,Average HR (bpm),Max HR (bpm)\n2026-11-10T17:00:00.000Z,2026-11-10T17:50:00.000Z,50,Weightlifting,9,128,170'
    const first = buildWhoopPreview([{ name: 'workouts.csv', text: csv }], { checkins: [], workouts: [] })
    expect(first.workouts).toHaveLength(1)
    const gone = { ...first.workouts[0], deleted: true }
    expect(buildWhoopPreview([{ name: 'workouts.csv', text: csv }], { checkins: [], workouts: [gone] }).workouts).toHaveLength(0)
  })
})
