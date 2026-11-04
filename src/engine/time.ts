import {
  addDays as fnsAddDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from 'date-fns'
import type { DayKey, Iso } from '../types'

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

export const dayKey = (d: Date | number | string): DayKey =>
  format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd')

export const parseDay = (key: DayKey): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
}

export const addDays = (d: Date | DayKey, n: number): Date =>
  fnsAddDays(typeof d === 'string' ? parseDay(d) : d, n)

export const addDayKey = (key: DayKey, n: number): DayKey => dayKey(addDays(key, n))

export const dayDiff = (a: DayKey, b: DayKey): number =>
  differenceInCalendarDays(parseDay(a), parseDay(b))

export const todayKey = (): DayKey => dayKey(new Date())

export const iso = (d: Date | number): Iso => new Date(d).toISOString()

export const toDate = (v: Iso | Date | number): Date =>
  v instanceof Date ? v : typeof v === 'number' ? new Date(v) : parseISO(v)

/** Liste de clés de jours [from, to] inclus. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = []
  let cur = parseDay(from)
  const end = parseDay(to)
  while (cur.getTime() <= end.getTime()) {
    out.push(dayKey(cur))
    cur = fnsAddDays(cur, 1)
  }
  return out
}

/** Les `n` derniers jours jusqu'à `to` inclus. */
export function lastDays(to: DayKey, n: number): DayKey[] {
  return dayRange(addDayKey(to, -(n - 1)), to)
}

export function weekBounds(d: Date | DayKey, weekStartsOn: 0 | 1): { start: DayKey; end: DayKey } {
  const date = typeof d === 'string' ? parseDay(d) : d
  return {
    start: dayKey(startOfWeek(date, { weekStartsOn })),
    end: dayKey(endOfWeek(date, { weekStartsOn })),
  }
}

export function monthBounds(d: Date | DayKey): { start: DayKey; end: DayKey } {
  const date = typeof d === 'string' ? parseDay(d) : d
  const s = new Date(date.getFullYear(), date.getMonth(), 1)
  const e = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  return { start: dayKey(s), end: dayKey(e) }
}

export const startOfHour = (t: number): number => Math.floor(t / HOUR_MS) * HOUR_MS

export const localMidnight = (key: DayKey): number => startOfDay(parseDay(key)).getTime()

/** `02:13` depuis des minutes. */
export function fmtDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

/** `mm:ss` depuis des secondes. */
export function fmtMinSec(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** `h:mm:ss` ou `mm:ss` selon la durée. */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Allure en secondes par km → `4:35 /km`. */
export function fmtPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  return `${fmtMinSec(secPerKm)} /km`
}
