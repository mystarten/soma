import { useEffect, useMemo, useRef } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { completePlanned, pastPlanned } from '../../engine/autoDone'
import { saveWorkouts } from '../../db/repo'
import { uid } from '../../db/db'
import { mergeProgramWithWhoop } from '../../db/seed'

/** Dès qu'un jour est passé, les séances que tu y avais placées comptent comme faites : le programme avance tout seul. */
export function useAutoComplete() {
  const data = useSoma()
  const busy = useRef(false)
  /* Une séance du programme a besoin du programme pour récupérer ses séries : on attend qu'il soit chargé. */
  const past = useMemo(() => pastPlanned(data.workouts, data.today).filter((w) => data.program || !w.program?.length), [data.workouts, data.today, data.program])
  useEffect(() => {
    if (!past.length || busy.current) return
    busy.current = true
    void (async () => {
      try {
        await saveWorkouts(past.map((w) => completePlanned(w, data.program, () => uid('set'), true)))
        await mergeProgramWithWhoop()
      } finally {
        busy.current = false
      }
    })()
  }, [past, data.program])
}
