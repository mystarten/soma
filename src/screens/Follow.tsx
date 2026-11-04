import { useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import { Badge, Card, EmptyState } from '../components/ui/primitives'
import { Spark } from '../components/charts/charts'
import {
  LEVEL_COLOR,
  LEVEL_LABEL,
  TREND_MIN_CONSECUTIVE_DAYS,
  visibleObservations,
  weeklyDigest,
} from '../engine/observations'
import { parseDay, weekBounds } from '../engine/time'

export default function Follow() {
  const data = useSoma()
  const shown = visibleObservations(data.observations, 3)
  const rest = data.observations.slice(3)

  const digest = useMemo(
    () =>
      weeklyDigest({
        checkins: data.checkins,
        workouts: data.workouts,
        exercises: data.exercises,
        bodyWeightKg: data.bodyWeightKg,
        sleepGoalHours: data.settings.sleepGoalHours,
        hrZones: data.settings.hrZones,
        today: data.today,
      }),
    [data],
  )

  const week = weekBounds(data.today, data.settings.weekStartsOn)

  return (
    <div className="mx-auto w-full max-w-2xl flex flex-col gap-3">
      <Card title="Bilan de la semaine" subtitle={`Depuis le ${format(parseDay(week.start), 'd MMMM', { locale: fr })}`}>
        <ul className="mt-2 space-y-1.5 text-sm text-mist-300">
          {digest.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-mist-700">·</span>
              {line}
            </li>
          ))}
        </ul>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title="Rien à signaler"
            hint={`L’app ne parle que si une tendance dure au moins ${TREND_MIN_CONSECUTIVE_DAYS} jours d’affilée, au-delà d’un écart type par rapport à ta base de 28 jours. Un jour isolé ne compte jamais.`}
          />
        </Card>
      ) : (
        shown.map((o) => (
          <Card key={o.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Badge color={LEVEL_COLOR[o.level]}>{LEVEL_LABEL[o.level]}</Badge>
                <div className="mt-2 text-sm font-medium text-mist-100">{o.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-mist-300">{o.sentence}</p>
              </div>
            </div>
            {o.series && o.series.length > 3 && (
              <div className="mt-3">
                <div className="mb-1 text-[0.62rem] tracking-wider text-mist-700 uppercase">
                  {o.metricLabel}
                </div>
                <Spark data={o.series} color={LEVEL_COLOR[o.level]} baseline={o.baseline} height={56} />
              </div>
            )}
          </Card>
        ))
      )}

      {rest.length > 0 && (
        <Card title="En arrière-plan" subtitle="Observations détectées mais non mises en avant">
          <ul className="mt-2 space-y-1 text-xs text-mist-700">
            {rest.map((o) => (
              <li key={o.id}>
                {o.title} — {o.sentence}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="px-2 pb-2 text-center text-[0.68rem] text-mist-700">
        Règles fixes, aucune IA : moyenne mobile 7 jours contre base personnelle 28 jours, écart
        supérieur à un écart type pendant {TREND_MIN_CONSECUTIVE_DAYS} jours au minimum. Trois
        observations au maximum.
      </p>
    </div>
  )
}
