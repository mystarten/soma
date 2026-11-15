import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { overloadAt, overloadSeries, type OverloadContext, type OverloadResult } from '../../engine/overload'

export const DELOAD_DEFAULT = 80

/** Charge de fond du jour et sa courbe sur 4 semaines. */
export function useOverload(): { now: OverloadResult; series: { day: string; score: number | null }[]; threshold: number; deloadActive: boolean; deloadUntil?: string } {
  const data = useSoma()
  const threshold = data.settings.deloadAt ?? DELOAD_DEFAULT
  const ctx: OverloadContext = useMemo(
    () => ({ byDay: data.checkinByDay, checkins: data.checkins, workouts: data.workouts, exercises: data.exercises, loadCtx: data.loadCtx, sleepGoal: data.settings.sleepGoalHours, threshold }),
    [data.checkinByDay, data.checkins, data.workouts, data.exercises, data.loadCtx, data.settings.sleepGoalHours, threshold],
  )
  const now = useMemo(() => overloadAt(data.today, ctx), [data.today, ctx])
  const series = useMemo(() => overloadSeries(data.today, ctx, 28), [data.today, ctx])
  const until = data.settings.deloadUntil
  return { now, series, threshold, deloadActive: !!until && until >= data.today, deloadUntil: until }
}
