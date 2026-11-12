import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import { navigate } from '../../lib/router'
import { WORKOUT_KIND_LABEL } from '../../engine/muscleMap'
import { addDayKey, parseDay } from '../../engine/time'
import { workoutLoad } from '../../engine/load'

/** Les dernières séances, qu'elles viennent de WHOOP ou de toi : date, durée, strain, fréquence cardiaque. */
export default function RecentWorkouts({ limit = 5 }: { limit?: number }) {
  const data = useSoma()
  const list = data.workouts
    .filter((w) => !w.planned)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit)

  const dayLabel = (day: string) =>
    day === data.today ? 'Aujourd’hui' : day === addDayKey(data.today, -1) ? 'Hier' : format(parseDay(day), 'EEE d MMM', { locale: fr })

  return (
    <section aria-label="Dernières séances" className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-medium text-mist-100">Dernières séances</h3>
        <button onClick={() => navigate('seances')} className="text-xs text-accent">
          Journal →
        </button>
      </div>
      {list.length === 0 ? (
        <p className="py-3 text-center text-xs text-mist-700">Aucune séance enregistrée pour l’instant.</p>
      ) : (
        <ul className="space-y-1">
          {list.map((w) => {
            const strain = w.whoopStrain ?? workoutLoad(w, data.loadCtx)
            return (
              <li key={w.id}>
                <button
                  onClick={() => navigate('seances', w.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/4"
                >
                  <span className="w-[4.5rem] shrink-0 text-[0.68rem] text-mist-500 capitalize">{dayLabel(w.day)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-mist-100">{w.title || WORKOUT_KIND_LABEL[w.kind]}</span>
                    <span className="block truncate text-[0.66rem] text-mist-700">
                      {Math.round(w.durationMin)} min
                      {w.avgHr ? ` · ${Math.round(w.avgHr)} bpm moy.` : ''}
                      {w.source === 'whoop' ? ' · WHOOP' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium text-accent tnum">{strain.toFixed(1)}</span>
                    <span className="block text-[0.6rem] text-mist-700">/21</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
