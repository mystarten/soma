import type { CheckIn, DayKey, SetEntry, Workout, WorkoutKind } from '../types'
import { addDayKey, lastDays, parseDay } from '../engine/time'
import { clamp } from '../engine/stats'
import { db, nowIso, uid } from './db'
import { saveCheckIns, saveWorkouts } from './repo'

/* ──────────────────────────────────────────────────────────────────────────
   Données de démonstration — entièrement fictives, générées localement.
   Supprimables en un clic dans Réglages.
   ────────────────────────────────────────────────────────────────────────── */

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DEMO_TAG = 'demo'

const PLAN: Record<number, { kind: WorkoutKind; title: string } | null> = {
  1: { kind: 'street', title: 'Pull' },
  2: { kind: 'course', title: 'Footing' },
  3: { kind: 'street', title: 'Push' },
  4: { kind: 'abdos', title: 'Core' },
  5: { kind: 'street', title: 'Legs / Skills' },
  6: { kind: 'course', title: 'Sortie longue' },
  0: null,
}

const PULL_SETS = ['ex_tractions_pronation', 'ex_tractions_lestees', 'ex_tractions_australiennes']
const PUSH_SETS = ['ex_dips', 'ex_pompes', 'ex_pompes_diamant']
const LEG_SETS = ['ex_squats', 'ex_pistol_squats', 'ex_fentes', 'ex_mollets']
const CORE_SETS = ['ex_gainage', 'ex_releves_jambes', 'ex_gainage_lateral']

export async function generateDemoData(days = 100): Promise<{ checkins: number; workouts: number }> {
  const rand = rng(20250930)
  const keys: DayKey[] = lastDays(new Date().toISOString().slice(0, 10), days)
  const checkins: CheckIn[] = []
  const workouts: Workout[] = []
  let fatigueProxy = 0

  for (const day of keys) {
    const weekday = parseDay(day).getDay()
    const plan = PLAN[weekday]
    const skip = rand() < 0.16
    const progress = keys.indexOf(day) / keys.length /* 0 → 1 : progression douce */

    /* ── Séance ── */
    if (plan && !skip) {
      const hour = plan.kind === 'course' ? (weekday === 6 ? 9 : 18) : rand() < 0.3 ? 12 : 19
      const startedAt = new Date(
        parseDay(day).getFullYear(),
        parseDay(day).getMonth(),
        parseDay(day).getDate(),
        hour,
        Math.floor(rand() * 50),
      ).toISOString()
      const base: Workout = {
        id: uid('w'),
        day,
        startedAt,
        durationMin: 0,
        kind: plan.kind,
        title: plan.title,
        rpe: 0,
        feeling: (2 + Math.round(rand() * 2)) as 2 | 3 | 4,
        source: DEMO_TAG,
        updatedAt: nowIso(),
      }

      if (plan.kind === 'course') {
        const long = weekday === 6
        const km = long ? 12 + rand() * 6 : 7 + rand() * 4
        const pace = (long ? 300 : 272) - progress * 16 + rand() * 12
        base.durationMin = Math.round((km * pace) / 60)
        base.rpe = long ? 6 : 5 + Math.round(rand() * 2)
        base.avgHr = Math.round(145 + rand() * 18)
        base.maxHr = Math.round((base.avgHr ?? 150) + 12 + rand() * 12)
        base.run = {
          runType: long ? 'sortie_longue' : rand() < 0.25 ? 'fractionne' : 'footing',
          distanceM: Math.round(km * 1000),
          durationSec: Math.round(km * pace),
          elevationGainM: Math.round(rand() * 160),
          elevationLossM: Math.round(rand() * 160),
          avgHr: base.avgHr,
          maxHr: base.maxHr,
          shoes: rand() < 0.5 ? 'Route' : 'Trail',
        }
      } else {
        const pool =
          plan.title === 'Pull'
            ? PULL_SETS
            : plan.title === 'Push'
              ? PUSH_SETS
              : plan.title === 'Core'
                ? CORE_SETS
                : LEG_SETS
        const sets: SetEntry[] = []
        for (const exerciseId of pool) {
          const n = 3 + Math.floor(rand() * 2)
          for (let i = 0; i < n; i++) {
            const isStatic = exerciseId.includes('gainage')
            sets.push({
              id: uid('set'),
              exerciseId,
              reps: isStatic ? undefined : Math.round((8 + rand() * 10) * (1 + progress * 0.12)),
              holdSec: isStatic ? Math.round(45 + rand() * 50) : undefined,
              loadKg: exerciseId.includes('lestees') ? 10 + Math.round(progress * 12) : undefined,
              restSec: 90,
              rpe: 6 + Math.round(rand() * 3),
              failure: i === n - 1 && rand() < 0.35,
            })
          }
        }
        base.sets = sets
        base.durationMin = Math.round(40 + rand() * 30)
        base.rpe = 6 + Math.round(rand() * 3)
      }
      workouts.push(base)
      fatigueProxy += (base.rpe ?? 6) * base.durationMin * 0.004
    }
    fatigueProxy *= 0.72

    /* ── Check-in du matin (il manque volontairement quelques jours) ── */
    if (rand() > 0.07) {
      const hours = clamp(6.4 + rand() * 2.2 - (weekday === 6 ? -0.4 : 0), 4.2, 9.5)
      const quality = clamp(55 + (hours - 6.5) * 18 + rand() * 14, 25, 99)
      const recovery = clamp(Math.round(62 + (hours - 7) * 11 + rand() * 16 - fatigueProxy * 8), 12, 97)
      const bedtime = new Date(
        parseDay(addDayKey(day, -1)).getFullYear(),
        parseDay(addDayKey(day, -1)).getMonth(),
        parseDay(addDayKey(day, -1)).getDate(),
        22 + Math.floor(rand() * 2),
        Math.floor(rand() * 59),
      )
      const total = hours * 60
      checkins.push({
        id: day,
        day,
        recovery,
        restingHr: Math.round(52 - (recovery - 60) * 0.09 + rand() * 2.4),
        hrv: Math.round(82 + (recovery - 60) * 0.55 + rand() * 9),
        weightKg: Math.round((72 - progress * 1.3 + (rand() - 0.5) * 0.7) * 10) / 10,
        mood: clamp(Math.round(2.6 + recovery / 45 + rand()), 1, 5) as 1 | 2 | 3 | 4 | 5,
        energy: clamp(Math.round(2.4 + recovery / 42 + rand()), 1, 5) as 1 | 2 | 3 | 4 | 5,
        stress: clamp(Math.round(4 - recovery / 40 + rand()), 1, 5) as 1 | 2 | 3 | 4 | 5,
        hydrationL: Math.round((1.8 + rand() * 1.4) * 10) / 10,
        respiratoryRate: Math.round((13.4 + rand() * 1.8) * 10) / 10,
        spo2: Math.round(95 + rand() * 3),
        sleep: {
          hours: Math.round(hours * 100) / 100,
          quality: Math.round(quality),
          bedtime: bedtime.toISOString(),
          wakeTime: new Date(bedtime.getTime() + hours * 3_600_000).toISOString(),
          awakenings: Math.floor(rand() * 3),
          deepMin: Math.round(total * (0.17 + rand() * 0.06)),
          remMin: Math.round(total * (0.2 + rand() * 0.06)),
          lightMin: Math.round(total * 0.52),
          awakeMin: Math.round(total * (0.04 + rand() * 0.05)),
          efficiency: Math.round(88 + rand() * 9),
          consistency: Math.round(65 + rand() * 28),
        },
        custom: {
          cm_motivation: Math.round(clamp(5 + recovery / 25 + rand() * 2, 1, 10)),
          cm_cafeine: Math.floor(rand() * 4),
        },
        source: DEMO_TAG,
        updatedAt: nowIso(),
      })
    }
  }

  await saveCheckIns(checkins)
  await saveWorkouts(workouts)
  return { checkins: checkins.length, workouts: workouts.length }
}

export async function removeDemoData(): Promise<void> {
  const [cs, ws] = await Promise.all([
    db.checkins.where('source').equals(DEMO_TAG).primaryKeys(),
    db.workouts.where('source').equals(DEMO_TAG).primaryKeys(),
  ])
  await db.checkins.bulkDelete(cs as string[])
  await db.workouts.bulkDelete(ws as string[])
}

export async function hasDemoData(): Promise<boolean> {
  const n = await db.checkins.where('source').equals(DEMO_TAG).count()
  return n > 0
}
