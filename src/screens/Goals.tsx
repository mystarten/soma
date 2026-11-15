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
import { deleteGoal, saveGoal, saveSettings } from '../db/repo'
import { uid } from '../db/db'
import { GOAL_KIND_LABEL, SOCLE_LABEL, STATUS_COLOR, STATUS_LABEL, evaluateGoal, goalPeriod, goalScore } from '../engine/goals'
import { DEFAULT_RECORD_ROWS } from '../engine/records'
import { WORKOUT_KIND_LABEL } from '../engine/muscleMap'
import { DEFAULT_WEEKLY_PLAN } from '../db/seed'
import { parseDay, todayKey } from '../engine/time'

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export const SOCLES = Object.keys(SOCLE_LABEL) as NonNullable<Goal['socle']>[]

/** Raccourcis : ce que l'on veut suivre, déjà réglé. Tout reste modifiable ensuite. */
const QUICK: { label: string; hint: string; make: () => Partial<Goal> }[] = [
  { label: 'Séances street workout', hint: 'par semaine', make: () => ({ name: 'Séances street workout', kind: 'sessions_socle', socle: 'street', target: 5, unit: 'séances' }) },
  { label: 'Séances jambes', hint: 'par semaine', make: () => ({ name: 'Séances jambes', kind: 'sessions_socle', socle: 'jambes', target: 2, unit: 'séances' }) },
  { label: 'Séances abdos', hint: 'par semaine', make: () => ({ name: 'Séances abdos', kind: 'sessions_socle', socle: 'abdos', target: 2, unit: 'séances' }) },
  { label: 'Séances cardio', hint: 'par semaine', make: () => ({ name: 'Séances cardio', kind: 'sessions_socle', socle: 'cardio', target: 3, unit: 'séances' }) },
  { label: 'Course à pied', hint: 'séances ou kilomètres', make: () => ({ name: 'Sorties course', kind: 'sessions_socle', socle: 'course', target: 2, unit: 'sorties' }) },
  { label: 'Natation', hint: 'par semaine', make: () => ({ name: 'Séances natation', kind: 'sessions_socle', socle: 'natation', target: 1, unit: 'séances' }) },
  { label: 'Récupération moyenne', hint: 'au-dessus de…', make: () => ({ name: 'Récupération moyenne', kind: 'recovery_avg', target: 75, unit: '%' }) },
  { label: 'Nuits assez longues', hint: '7 nuits sur 7 au-dessus de 7 h', make: () => ({ name: 'Nuits au-dessus de 7 h', kind: 'sleep_nights_above', target: 7, threshold: 7, unit: 'nuits' }) },
  { label: 'Sommeil moyen', hint: 'heures par nuit', make: () => ({ name: 'Sommeil moyen', kind: 'sleep_hours', target: 7.5, unit: 'h' }) },
  { label: 'Record à battre', hint: 'tractions, pompes, 5 km…', make: () => ({ name: 'Record visé', kind: 'performance', period: 'month', target: 40, exerciseId: 'ex_tractions_pronation' }) },
  { label: 'Poids visé', hint: 'pesée du jour', make: () => ({ name: 'Poids visé', kind: 'weight', period: 'month', target: 75, direction: 'max', unit: 'kg' }) },
  { label: 'Kilomètres courus', hint: 'par semaine', make: () => ({ name: 'Kilomètres par semaine', kind: 'volume_km', target: 20, unit: 'km' }) },
]

const KIND_GROUPS: { label: string; kinds: GoalKind[] }[] = [
  { label: 'Séances', kinds: ['sessions_socle', 'sessions_count', 'sessions_by_kind', 'weekly_plan'] },
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

const IMPORTANCE = [
  { value: '0.5', label: 'Faible' },
  { value: '1', label: 'Normal' },
  { value: '2', label: 'Élevée' },
]

/** Mon grand objectif (compte à rebours) et le sommeil visé : tout est ici, plus dans les réglages. */
function BigGoal() {
  const data = useSoma()
  const s = data.settings
  const cd = s.countdown
  const left = cd ? differenceInCalendarDays(parseDay(cd.date), new Date()) : null
  const set = (p: Partial<NonNullable<typeof cd>>) =>
    void saveSettings({ countdown: { name: cd?.name ?? '', date: cd?.date ?? todayKey(), discipline: cd?.discipline, ...p } })
  return (
    <Card title="Mon grand objectif" subtitle="Ce vers quoi tu t’entraînes, avec sa date">
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_11rem_auto]">
        <Field label="Intitulé">
          <TextInput value={cd?.name ?? ''} placeholder="Ex. concours, test physique…" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={cd?.date ?? ''} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <div className="flex items-end pb-1">
          {left !== null && cd?.name ? (
            <span className="rounded-xl bg-accent/10 px-3 py-2 text-sm font-medium text-accent tnum">
              {left >= 0 ? `J-${left}` : 'Date passée'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/6 pt-3">
        <div>
          <div className="text-xs font-medium text-mist-300">Nuit visée</div>
          <div className="text-[0.68rem] text-mist-500">Sert au score de sommeil et à la dette de sommeil</div>
        </div>
        <div className="w-40">
          <Stepper value={s.sleepGoalHours} onChange={(v) => void saveSettings({ sleepGoalHours: v })} step={0.25} precision={2} min={5} max={11} suffix="h" />
        </div>
      </div>
    </Card>
  )
}

export default function Goals() {
  const data = useSoma()
  const [editing, setEditing] = useState<Goal | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [period, setPeriod] = useState<GoalPeriod>('week')
  const [why, setWhy] = useState(false)
  const [openList, setOpenList] = useState<string | null>(null)
  const toast = useToast()

  const progress = useMemo(
    () =>
      data.goals
        .filter((g) => g.period === period)
        .map((g) => {
          const { from, to } = goalPeriod(g, data.today, data.settings.weekStartsOn)
          return { p: evaluateGoal(g, from, to, data.goalCtx), from, to, score: goalScore(g, data.goalCtx, data.today) }
        }),
    [data.goals, data.goalCtx, data.today, data.settings.weekStartsOn, period],
  )
  const counted = data.goals.filter((g) => g.active)

  return (
    <div className="mx-auto w-full max-w-6xl">
      {toast.node}

      <Card className="mb-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">Score de ton plan · cette semaine</div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tnum" style={{ color: data.alignment >= 80 ? '#41e08a' : data.alignment >= 60 ? '#ffc24b' : '#ffb02e' }}>
                {counted.length ? data.alignment : '—'}
              </span>
              <span className="text-sm text-mist-500">/ 100</span>
            </div>
            {counted.length > 0 && <p className="mt-0.5 text-xs text-mist-500">Régularité sur les 4 dernières semaines : <span className="text-mist-300">{data.alignmentAvg} %</span></p>}
            <button onClick={() => setWhy((v) => !v)} className="mt-1 text-xs text-accent">
              {why ? 'Masquer' : 'Comment est-il calculé ?'}
            </button>
          </div>
          <div className="w-28">
            <ProgressBar ratio={data.alignment / 100} color="var(--accent)" />
          </div>
        </div>
        {why && (
          <div className="mt-3 space-y-2 border-t border-white/6 pt-3 text-xs leading-relaxed text-mist-300">
            <p>Chaque objectif actif donne un pourcentage : <b>ce que tu as fait ÷ ce que tu as visé</b>, au maximum 100 %. Faire plus que prévu ne compense pas un autre objectif.</p>
            <p>Le <b>score</b> est l’avancement de la <b>semaine en cours</b> (ou du mois pour les objectifs mensuels), c’est-à-dire ce que montrent les cartes. Il est la moyenne de tous les objectifs, chacun pesant selon son <b>importance</b>. Un objectif en pause ou sans donnée ne compte pas.</p>
            <p>La <b>régularité</b>, en dessous, est la moyenne de tes 4 dernières semaines terminées : elle dit si tu tiens le rythme dans la durée.</p>
            {data.goals.filter((g) => g.active).length > 0 && (
              <ul className="space-y-1 pt-1">
                {data.goals.filter((g) => g.active).map((g) => {
                  const r = goalScore(g, data.goalCtx, data.today)
                  return (
                    <li key={g.id} className="flex justify-between gap-3">
                      <span className="truncate">{g.name} <span className="text-mist-500">· importance {g.weight >= 2 ? 'élevée' : g.weight < 1 ? 'faible' : 'normale'}</span></span>
                      <span className="tnum text-mist-100">{r === null ? 'pas de données' : `${Math.round(r * 100)} %`}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between gap-2">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Chaque semaine' }, { value: 'month', label: 'Ce mois-ci' }]} />
        <Button variant="primary" onClick={() => setChoosing(true)}>
          + Objectif
        </Button>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {!progress.length && (
          <Card>
            <EmptyState
              title={period === 'week' ? 'Aucun objectif hebdomadaire' : 'Aucun objectif pour le mois'}
              hint="Choisis toi-même ce que tu veux suivre : séances par type, récupération, sommeil, records…"
              action={<Button variant="primary" className="mt-2" onClick={() => setChoosing(true)}>Ajouter un objectif</Button>}
            />
          </Card>
        )}

        {progress.map(({ p, from, to, score }) => {
          const color = p.goal.active ? STATUS_COLOR[p.status] : '#5a6c86'
          const deadlineDays = p.goal.deadline ? differenceInCalendarDays(parseDay(p.goal.deadline), new Date()) : null
          return (
            <Card key={p.goal.id} onClick={() => setEditing(structuredClone(p.goal))} className={p.goal.active ? '' : 'opacity-60'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-mist-100">{p.goal.name}</span>
                    {!p.goal.active && <Badge>en pause</Badge>}
                  </div>
                  <div className="text-[0.68rem] text-mist-700">
                    {p.detail ? `${p.detail} · ` : ''}
                    {format(parseDay(from), 'd MMM', { locale: fr })} – {format(parseDay(to), 'd MMM', { locale: fr })}
                    {score !== null && p.goal.period === 'week' ? ` · moyenne 4 sem. : ${Math.round(score * 100)} %` : ''}
                  </div>
                </div>
                <Badge color={color}>{p.goal.active ? STATUS_LABEL[p.status] : 'Pause'}</Badge>
              </div>

              <div className="mt-2.5">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-mist-500">
                    {p.goal.direction === 'max' ? 'Rester sous' : 'Objectif'}{' '}
                    <span className="text-mist-100 tnum">{p.target} {p.label}</span>
                  </span>
                  <span className="text-mist-100 tnum">{Math.round(p.actual * 10) / 10} {p.label}</span>
                </div>
                <ProgressBar ratio={p.ratio} color={color} />
              </div>

              {p.matched && p.matched.length > 0 && (
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setOpenList(openList === p.goal.id ? null : p.goal.id)} className="text-[0.7rem] text-accent">
                    {openList === p.goal.id ? 'Masquer' : `Voir les ${p.matched.length} séance${p.matched.length > 1 ? 's' : ''} comptée${p.matched.length > 1 ? 's' : ''}`}
                  </button>
                  {openList === p.goal.id && (
                    <ul className="mt-1.5 space-y-1 text-[0.7rem] text-mist-300">
                      {p.matched.map((w) => (
                        <li key={w.id} className="flex justify-between gap-2 rounded-lg bg-white/4 px-2.5 py-1.5">
                          <span className="truncate">{format(parseDay(w.day), 'EEE d', { locale: fr })} · {w.title || WORKOUT_KIND_LABEL[w.kind]}</span>
                          <span className="shrink-0 text-mist-500">{w.durationMin} min · {w.source === 'whoop' ? 'WHOOP' : 'saisie'}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {p.series && p.series.length > 0 && (
                <div className="mt-2">
                  <Bars data={p.series.map((x) => ({ day: x.label, prevu: x.planned, reel: x.actual }))} xKey="day" height={120} hideY yDomain={[0, 1]} series={[{ key: 'prevu', color: '#2d4668', name: 'Prévu' }, { key: 'reel', color: 'var(--accent)', name: 'Réel' }]} />
                </div>
              )}

              {deadlineDays !== null && (
                <div className="mt-2 text-[0.68rem] text-mist-700">
                  Échéance {format(parseDay(p.goal.deadline!), 'd MMMM yyyy', { locale: fr })} · {deadlineDays >= 0 ? `${deadlineDays} jours restants` : 'date passée'}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="mt-4">
        <BigGoal />
      </div>

      <p className="mt-3 px-2 text-center text-[0.68rem] text-mist-700">
        « Tenu » dès 80 % de l’objectif, « en cours » entre 60 et 80 %. Touche un objectif pour le modifier, le mettre en pause ou le supprimer.
      </p>

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Que veux-tu suivre ?" wide>
        <div className="grid gap-2 pb-2 sm:grid-cols-2">
          {QUICK.map((q) => (
            <button
              key={q.label}
              onClick={() => {
                setChoosing(false)
                setEditing({ ...newGoal(), period: period, ...q.make(), ...(q.make().period ? {} : { period }) } as Goal)
              }}
              className="rounded-xl bg-white/4 px-3.5 py-3 text-left hairline transition active:scale-[0.99]"
            >
              <div className="text-sm font-medium text-mist-100">{q.label}</div>
              <div className="text-[0.7rem] text-mist-500">{q.hint}</div>
            </button>
          ))}
          <button
            onClick={() => {
              setChoosing(false)
              setEditing({ ...newGoal(), period })
            }}
            className="rounded-xl border border-dashed border-white/15 px-3.5 py-3 text-left transition active:scale-[0.99] sm:col-span-2"
          >
            <div className="text-sm font-medium text-mist-100">Autre…</div>
            <div className="text-[0.7rem] text-mist-500">Tous les types d’objectifs, réglage complet</div>
          </button>
        </div>
      </Sheet>

      {editing && <GoalEditor goal={editing} onClose={() => setEditing(null)} onSaved={() => toast.show('Objectif enregistré')} />}
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

        {g.kind === 'sessions_socle' && (
          <Field label="Quelles séances compter ?" hint="Les séances cochées dans le programme (T, J, A…) et celles du bon type.">
            <Select
              value={g.socle ?? 'street'}
              onChange={(v) => patch({ socle: v as NonNullable<Goal['socle']> })}
              options={SOCLES.map((k) => ({ value: k, label: SOCLE_LABEL[k] }))}
            />
          </Field>
        )}

        {g.kind === 'performance' && (
          <Field label="Record visé" hint="Ton meilleur chiffre vient de tes séances et de l’onglet Records (modifiable là-bas).">
            <Select
              value={g.exerciseId ?? 'ex_tractions_pronation'}
              onChange={(v) => patch({ exerciseId: v, ...(v === 'run_5k' ? { direction: 'max' as const, unit: 'min' } : { direction: 'min' as const }) })}
              options={[
                ...DEFAULT_RECORD_ROWS.map((r) => ({ value: r.id, label: r.label })),
                ...data.exercises.filter((e) => !e.archived && !DEFAULT_RECORD_ROWS.some((r) => r.id === e.id)).map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
          </Field>
        )}

        {(g.kind === 'volume_reps' || g.kind === 'volume_tonnage') && (
          <Field label="Exercice">
            <Select
              value={g.exerciseId ?? data.exercises[0]?.id ?? ''}
              onChange={(v) => patch({ exerciseId: v })}
              options={data.exercises.filter((e) => !e.archived).map((e) => ({ value: e.id, label: e.name }))}
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

        <Field label="Importance dans le score" group>
          <Segmented value={String(g.weight >= 2 ? 2 : g.weight < 1 ? 0.5 : 1)} onChange={(v) => patch({ weight: Number(v) })} options={IMPORTANCE} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
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
          <span className="text-xs text-mist-300">Objectif actif <span className="text-mist-500">· décoche pour le mettre en pause (ex. j’ai arrêté de courir)</span></span>
          <Toggle checked={g.active} onChange={(v) => patch({ active: v })} label="Actif" />
        </div>
      </div>
    </Sheet>
  )
}
