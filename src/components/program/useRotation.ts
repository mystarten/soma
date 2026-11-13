import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { programDone } from '../../engine/program'
import { computeRotation, lastDoneBySession, type SocleRotation } from '../../engine/rotation'

/** Le roulement du programme : ce qui est à faire maintenant, ce qui attend son tour, ce qui est terminé. */
export function useRotation(): { rotation: SocleRotation[]; done: Map<string, Set<number>>; all: ReturnType<typeof useSoma>['workouts'] } {
  const data = useSoma()
  const all = useMemo(() => [...data.workouts, ...data.programMarks], [data.workouts, data.programMarks])
  const done = useMemo(() => programDone(all), [all])
  const rotation = useMemo(
    () => (data.program ? computeRotation(data.program, done, lastDoneBySession(data.workouts)) : []),
    [data.program, done, data.workouts],
  )
  return { rotation, done, all }
}
