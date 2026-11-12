import { useEffect, useRef } from 'react'
import { useSoma } from '../hooks/useSoma'
import { readWhoopLast, whoopConnected, whoopConnectedFlag, whoopSync } from './whoop'

/**
 * Récupération automatique : chaque jour à partir de 10 h (heure locale), dès que l'app est ouverte, et
 * toutes les 20 minutes tant qu'elle reste ouverte, jusqu'à ce que la récupération du jour soit là.
 * Elle reprend aussi les 3 derniers jours, ce qui complète la charge (strain) de la veille.
 * Une application fermée ne peut pas travailler en arrière-plan : la récupération se fait à l'ouverture.
 */
const HOUR = 10
const RETRY_MS = 20 * 60_000

export default function WhoopAuto() {
  const data = useSoma()
  const signedIn = data.syncState.kind !== 'disabled' && data.syncState.kind !== 'signed-out'
  const busy = useRef(false)
  const todayRecovery = useRef<number | undefined>(undefined)
  todayRecovery.current = data.checkinByDay.get(data.today)?.recovery

  useEffect(() => {
    if (!signedIn) return
    let stopped = false

    const attempt = async () => {
      if (busy.current || stopped) return
      const now = new Date()
      if (now.getHours() < HOUR) return
      const last = readWhoopLast()
      const lastAt = last ? new Date(last.at) : null
      const doneToday = !!lastAt && lastAt.toDateString() === now.toDateString() && lastAt.getHours() >= HOUR
      /* Déjà fait aujourd'hui avec une récupération présente : rien à refaire. */
      if (doneToday && typeof todayRecovery.current === 'number') return
      /* Fait aujourd'hui mais la récupération manque encore : on réessaie, sans harceler WHOOP. */
      if (doneToday && lastAt && now.getTime() - lastAt.getTime() < RETRY_MS) return
      busy.current = true
      try {
        const connected = whoopConnectedFlag() || (await whoopConnected().catch(() => false))
        if (connected && !stopped) await whoopSync(3)
      } catch {
        /* silencieux : la carte WHOOP montre l'erreur à la demande */
      } finally {
        busy.current = false
      }
    }

    void attempt()
    const timer = window.setInterval(() => void attempt(), RETRY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void attempt()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [signedIn])

  return null
}
