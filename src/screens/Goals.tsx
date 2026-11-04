import { useMemo, useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import type { Goal, GoalKind, GoalPeriod, WeekdayPlan, WorkoutKind } from '../types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  ProgressBar,
  Segmented,
  Select,
  Sheet,
  Stepper,
  TextInput,
  Toggle,
  useToast,
} from '../components/ui/primitives'
import { Bars } from '../components/charts/charts'
import { deleteGoal, saveGoal } from '../db/repo'
import { uid } from '../db/db'
import { GOAL_KIND_LABEL, STATUS_COLOR, STATUS_LABEL, evaluateGoal, goalPeriod } from '../engine/goals'
import { WORKOUT_KIND_LABEL } from '../engine/muscleMap'
import { DEFAULT_WEEKLY_PLAN } from '../db/seed'
import { parseDay } from '../engine/time'

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const KIND_GROUPS: { label: string; kinds: GoalKind[] }[] = [
  { label: 'Séances', kinds: ['sessions_count', 'sessions_by_kind', 'weekly_plan'] },
  { label: 'Volume', kinds: ['volume_km', 'volume_reps', 'volume_tonnage', 'cardio_minutes'] },
  { label: 'Performance', kinds: ['performance'] },
  { label: 'Sommeil', kinds: ['sleep_hours', 'sleep_regularity', 'sleep_nights_above'] },
  { label: 'Santé', kinds: ['weight', 'resting_hr', 'hrv', 'recovery_avg'] },
  { label: 'Personnalisé', kinds: ['custom_metric'] },
]

function newGoal(): Goal {
  return {
    id: uid('goal'),
    name: 'Nouvel objectif',
    kind: 'sessions_count',
    period: 'week',
    target: 4,
    direction: 'min',
    weight: 1,
    active: true,
    updatedAt: new Date().toISOString(),
  }
}

export default function Goals() {
  const data = useSoma()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [period, setPeriod] = useState<GoalPeriod>('week')
  const toast = useToast()

  const progress = useMemo(
    () =>
      data.goals
        .filter((g) => g.period === period)
        .map((g) => {
          const { from, to } = goalPeriod(g, data.today, data.settings.weekStartsOn)
          return { p: evaluateGoal(g, from, to, data.goalCtx), from, to }
        }),
    [data.goals, data.goalCtx, data.today, data.settings.weekStartsOn, period],
  )

  return (
    <div className="mx-auto w-full max-w-6xl">
      {toast.node}

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">
              Score Alignement
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-4xl font-semibold tnum"
                style={{
                  color:
                    data.alignment >= 80 ? '#41e08a' : data.alignment >= 60 ? '#ffc24b' : '#ffb02e',
                }}
              >
                {data.alignment}
              </span>
              <span className="text-sm text-mist-500">/ 100</span>
            </div>
            <p className="mt-1 text-xs text-mist-700">
              Moyenne pondérée de tes objectifs actifs sur 4 semaines glissantes.
            </p>
          </div>
          <div className="w-28">
            <ProgressBar ratio={data.alignment / 100} color="var(--accent)" />
          </div>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'Semaine' },
            { value: 'month', label: 'Mois' },
          ]}
        />
        <Button variant="primary" onClick={() => setEditing(newGoal())}>
          + Objectif
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {!progress.length && (
          <Card>
            <EmptyState
              title={`Aucun objectif ${period === 'week' ? 'hebdomadaire' : 'mensuel'}`}
              hint="Crée un objectif, ou garde les exemples pré-remplis dans l’autre période."
              action={
                <Button variant="primary" className="mt-2" onClick={() => setEditing(newGoal())}>
                  Créer un objectif
                </Button>
              }
            />
          </Card>
        )}

        {progress.map(({ p, from, to }) => {
          const color = STATUS_COLOR[p.status]
          const deadlineDays = p.goal.deadline
            ? differenceInCalendarDays(parseDay(p.goal.deadline), new Date())
            : null
          return (
            <Card key={p.goal.id} onClick={() => setEditing(structuredClone(p.goal))}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-mist-100">{p.goal.name}</span>
                    {!p.goal.active && <Badge>en pause</Badge>}
                  </div>
                  <div className="text-[0.68rem] text-mist-700">
                    {GOAL_KIND_LABEL[p.goal.kind]}
                    {p.detail ? ` · ${p.detail}` : ''}
                    {' · '}
                    {format(parseDay(from), 'd MMM', { locale: fr })} –{' '}
                    {format(parseDay(to), 'd MMM', { locale: fr })}
                  </div>
                </div>
                <Badge color={color}>{STATUS_LABEL[p.status]}</Badge>
              </div>

              <div className="mt-2.5">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-mist-500">
                    {p.goal.direction === 'max' ? 'Rester sous' : 'Atteindre'}{' '}
                    <span className="text-mist-100 tnum">
                      {p.target} {p.label}
                    </span>
                  </span>
                  <span className="text-mist-100 tnum">
                    {Math.round(p.actual * 10) / 10} {p.label}
                  </span>
                </div>
                <ProgressBar ratio={p.ratio} color={color} />
              </div>

              {p.series && p.series.length > 0 && (
                <div className="mt-2">
                  <Bars
                    data={p.series.map((s) => ({
                      day: s.label,
                      prevu: s.planned,
                      reel: s.actual,
                    }))}
                    xKey="day"
                    height={120}
                    hideY
                    yDomain={[0, 1]}
                    series={[
                      { key: 'prevu', color: '#2d4668', name: 'Prévu' },
                      { key: 'reel', color: 'var(--accent)', name: 'Réel' },
                    ]}
                  />
                </div>
              )}

              {deadlineDays !== null && (
                <div className="mt-2 text-[0.68rem] text-mist-700">
                  Échéance {format(parseDay(p.goal.deadline!), 'd MMMM yyyy', { locale: fr })} ·{' '}
                  {deadlineDays >= 0 ? `${deadlineDays} jours restants` : 'date passée'}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <p className="mt-3 px-2 text-center text-[0.68rem] text-mist-700">
        Tenu à partir de 80 %, en cours entre 60 et 80 %, en retard en dessous. Ces seuils sont
        réglables objectif par objectif.
      </p>

      {editing && (
        <GoalEditor
          goal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => toast.show('Objectif enregistré')}
        />
      )}
    </div>
  )
}

function GoalEditor({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal
  onClose: () => void
  onSaved: () => void
}) {
  const data = useSoma()
  const [g, setG] = useState<Goal>(goal)
  const patch = (p: Partial<Goal>) => setG((prev) => ({ ...prev, ...p }))
  const plan: WeekdayPlan = g.plan ?? DEFAULT_WEEKLY_PLAN

  return (
    <Sheet
      open
      onClose={onClose}
      title="Objectif"
      wide
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            onClick={async () => {
              await saveGoal(g)
              onSaved()
              onClose()
            }}
          >
            Enregistrer
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteGoal(g.id)
              onClose()
            }}
          >
            Supprimer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Nom">
          <TextInput value={g.name} onChange={(e) => patch({ name: e.target.value })} />
        </Field>

        <Field label="Type d’objectif">
          <Select
            value={g.kind}
            onChange={(v) => patch({ kind: v as GoalKind })}
            options={KIND_GROUPS.flatMap((grp) =>
              grp.kinds.map((k) => ({ value: k, label: `${grp.label} — ${GOAL_KIND_LABEL[k]}` })),
            )}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Période" group>
            <Segmented
              value={g.period}
              onChange={(v) => patch({ period: v })}
              options={[
                { value: 'week', label: 'Semaine' },
                { value: 'month', label: 'Mois' },
              ]}
            />
          </Field>
          <Field label="Direction" group>
            <Segmented
              value={g.direction}
              onChange={(v) => patch({ direction: v })}
              options={[
                { value: 'min', label: 'Atteindre au moins' },
                { value: 'max', label: 'Rester sous' },
              ]}
            />
          </Field>
          <Field label="Cible">
            <Stepper
              value={g.target}
              onChange={(v) => patch({ target: v })}
              step={g.kind === 'sleep_hours' ? 0.25 : 1}
              precision={g.kind === 'sleep_hours' ? 2 : 0}
              min={0}
              max={100000}
            />
          </Field>
          <Field label="Unité" optional>
            <TextInput
              value={g.unit ?? ''}
              onChange={(e) => patch({ unit: e.target.value })}
              placeholder="km, reps, h…"
            />
          </Field>
        </div>

        {g.kind === 'sessions_by_kind' && (
          <Field label="Type de séance">
            <Select
              value={g.workoutKind ?? 'street'}
              onChange={(v) => patch({ workoutKind: v as WorkoutKind })}
              options={Object.entries(WORKOUT_KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))}
            />
          </Field>
        )}

        {(g.kind === 'volume_reps' || g.kind === 'volume_tonnage' || g.kind === 'performance') && (
          <Field label="Exercice">
            <Select
              value={g.exerciseId ?? data.exercises[0]?.id ?? ''}
              onChange={(v) => patch({ exerciseId: v })}
              options={data.exercises
                .filter((e) => !e.archived)
                .map((e) => ({ value: e.id, label: e.name }))}
            />
          </Field>
        )}

        {g.kind === 'custom_metric' && (
          <Field label="Métrique">
            <Select
              value={g.customMetricId ?? data.metrics[0]?.id ?? ''}
              onChange={(v) => patch({ customMetricId: v })}
              options={data.metrics.map((m) => ({ value: m.id, label: m.name }))}
            />
          </Field>
        )}

        {g.kind === 'sleep_nights_above' && (
          <Field label="Seuil par nuit">
            <Stepper
              value={g.threshold ?? 7}
              onChange={(v) => patch({ threshold: v })}
              step={0.25}
              precision={2}
              min={0}
              max={14}
              suffix="h"
            />
          </Field>
        )}

        {g.kind === 'weekly_plan' && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-mist-300">Plan hebdomadaire</div>
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                const entry = plan.find((p) => p.weekday === wd)
                return (
                  <div key={wd} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-mist-500">{WEEKDAYS[wd]}</span>
                    <div className="flex-1">
                      <Select
                        value={entry?.kind ?? 'repos'}
                        onChange={(v) => {
                          const next = plan.filter((p) => p.weekday !== wd)
                          next.push({ weekday: wd, kind: v as WorkoutKind | 'repos', label: entry?.label })
                          patch({ plan: next.sort((a, b) => a.weekday - b.weekday) })
                        }}
                        options={[
                          { value: 'repos', label: 'Repos' },
                          ...Object.entries(WORKOUT_KIND_LABEL).map(([k, l]) => ({
                            value: k,
                            label: l,
                          })),
                        ]}
                      />
                    </div>
                    <TextInput
                      className="w-28"
                      placeholder="libellé"
                      value={entry?.label ?? ''}
                      onChange={(e) => {
                        const next = plan.filter((p) => p.weekday !== wd)
                        next.push({
                          weekday: wd,
                          kind: entry?.kind ?? 'repos',
                          label: e.target.value,
                        })
                        patch({ plan: next.sort((a, b) => a.weekday - b.weekday) })
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Field label="Échéance" optional hint="Utile pour un record visé.">
          <TextInput
            type="date"
            value={g.deadline ?? ''}
            onChange={(e) => patch({ deadline: e.target.value || undefined })}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Poids dans l’Alignement">
            <Stepper
              value={g.weight}
              onChange={(v) => patch({ weight: v })}
              step={0.5}
              precision={1}
              min={0}
              max={5}
            />
          </Field>
          <Field label="Seuil « tenu »">
            <Stepper
              value={(g.thresholdOk ?? 0.8) * 100}
              onChange={(v) => patch({ thresholdOk: v / 100 })}
              step={5}
              min={10}
              max={100}
              suffix="%"
            />
          </Field>
          <Field label="Seuil « en cours »">
            <Stepper
              value={(g.thresholdMid ?? 0.6) * 100}
              onChange={(v) => patch({ thresholdMid: v / 100 })}
              step={5}
              min={5}
              max={100}
              suffix="%"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2.5 hairline">
          <span className="text-xs text-mist-300">Objectif actif</span>
          <Toggle checked={g.active} onChange={(v) => patch({ active: v })} label="Actif" />
        </div>
      </div>
    </Sheet>
  )
}
