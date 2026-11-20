import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { PlanContext } from '../../engine/planStore'

/** Tout ce qu'il faut pour calculer et prévisualiser le plan : le programme, les réglages, le journal et les jours indisponibles. */
export function usePlanCtx(days: number): PlanContext | null {
  const data = useSoma()
  const blockedRaw = data.settings.planBlocked
  return useMemo(() => {
    if (!data.program) return null
    const blocked = (blockedRaw ?? []).filter((d) => d >= data.today)
    return { program: data.program, today: data.today, days, settings: data.settings, workouts: data.workouts, blocked }
  }, [data.program, data.today, days, data.settings, data.workouts, blockedRaw])
}
