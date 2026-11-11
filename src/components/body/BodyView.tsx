import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Joint, MuscleZone } from '../../types'
import { MUSCLE_ZONES } from '../../types'
import { useSoma } from '../../hooks/useSoma'
import { fatigueAt, prepareFatigue, availabilityScore, bodySummary } from '../../engine/fatigue'
import {
  BAND_LABEL,
  JOINT_LABEL,
  ZONE_LABEL,
  ZONE_SHORT,
  fatigueBand,
  fatigueColor,
} from '../../engine/fatigueConfig'
import { allJointInfo, hasWebGL, isLowPower } from '../../engine/body'
import { agoLabel, explainZone, suggestSession, zoneList, zoneSentence } from '../../engine/suggest'
import { computeSleepScore, sleepDebtHours, sleepHours, sleepRegularity } from '../../engine/sleep'
import { addDayKey, lastDays, toDate } from '../../engine/time'
import { volumeSummary } from '../../engine/load'
import { mean } from '../../engine/stats'
import { Badge, Button, Card, Dot, Segmented, Sheet, Stat } from '../ui/primitives'
import { Spark } from '../charts/charts'
import type { BodyLayer } from './Body3D'
import Body2D from './Body2D'
import { useNeuralModel } from '../neural/useNeuralModel'
import { NeuralHud, NeuralModals } from '../neural/NeuralHud'

const Body3D = lazy(() => import('./Body3D'))

type Selection = MuscleZone | 'cerveau' | 'coeur' | Joint | null

const LAYERS: { value: BodyLayer; label: string }[] = [
  { value: 'muscles', label: 'Muscles' },
  { value: 'organes', label: 'Organes' },
  { value: 'articulations', label: 'Articul.' },
  { value: 'tout', label: 'Tout' },
]

const HORIZONS = [
  { value: 0, label: 'Maintenant' },
  { value: 12, label: '+12 h' },
  { value: 24, label: '+24 h' },
  { value: 48, label: '+48 h' },
]

const LEG_ZONES: MuscleZone[] = ['quadriceps', 'ischios', 'fessiers', 'mollets', 'tibias', 'adducteurs']
const JOINTS_LIST: Joint[] = ['epaules', 'coudes', 'poignets', 'genoux', 'chevilles']

export default function BodyView({
  compact = false,
  hero = false,
}: {
  compact?: boolean
  /** Élément central de l'accueil : très grand, contrôles réduits au minimum. */
  hero?: boolean
}) {
  const data = useSoma()
  const [layer, setLayer] = useState<BodyLayer>('tout')
  const [selected, setSelected] = useState<Selection>(null)
  const [azimuth, setAzimuth] = useState(0)
  const [horizon, setHorizon] = useState(0)
  const [dayOffset, setDayOffset] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [render3d, setRender3d] = useState(false)
  /** Vrai quand on est assez près du cerveau pour voir les neurones. */
  const [deep, setDeep] = useState(false)
  const [diveCommand, setDiveCommand] = useState<{ to: number; nonce: number }>()
  const diveTo = (to: number) => setDiveCommand((c) => ({ to, nonce: (c?.nonce ?? 0) + 1 }))
  const raf = useRef(0)

  const neuralModel = useNeuralModel(!compact)
  const webgl = useMemo(() => hasWebGL(), [])
  const low = useMemo(() => isLowPower(), [])
  const use3d = data.settings.bodyRender === '3d' && webgl

  /* Le canvas 3D n'est monté qu'une fois l'écran visible (chargement paresseux). */
  useEffect(() => {
    const t = window.setTimeout(() => setRender3d(true), compact ? 350 : 60)
    return () => window.clearTimeout(t)
  }, [compact])


  /* Lecture animée de la dernière semaine. */
  useEffect(() => {
    if (!playing) return
    let start = performance.now()
    const dur = 6000
    const step = (now: number) => {
      const t = (now - start) / dur
      if (t >= 1) {
        start = now
        setDayOffset(-7)
      } else {
        setDayOffset(-7 + t * 7)
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing])

  const dayAnchor = Math.round(dayOffset)
  const prepared = useMemo(
    () =>
      prepareFatigue(
        data.fatigueCtx,
        data.nowMs + dayAnchor * 86_400_000,
        data.nowMs + dayAnchor * 86_400_000 + 15 * 86_400_000,
      ),
    [data.fatigueCtx, data.nowMs, dayAnchor],
  )

  const effectiveTime = data.nowMs + dayOffset * 86_400_000 + horizon * 3_600_000
  const body = useMemo(
    () => fatigueAt(effectiveTime, data.fatigueCtx, prepared),
    [effectiveTime, data.fatigueCtx, prepared],
  )

  const availability = useMemo(() => availabilityScore(body), [body])
  const summary = useMemo(() => bodySummary(body), [body])
  const joints = useMemo(() => allJointInfo(body), [body])
  const suggestion = useMemo(
    () =>
      suggestSession(
        body,
        data.templates,
        data.exercises,
        data.today,
        data.goals.find((g) => g.kind === 'weekly_plan' && g.active)?.plan,
      ),
    [body, data.templates, data.exercises, data.today, data.goals],
  )

  const jointColors = useMemo(
    () =>
      Object.fromEntries(
        JOINTS_LIST.map((j) => [j, { ratio: joints[j].ratio, color: joints[j].color }]),
      ) as Record<Joint, { ratio: number; color: string }>,
    [joints],
  )

  const timeLabel =
    dayOffset === 0 && horizon === 0
      ? 'Maintenant'
      : format(new Date(effectiveTime), "EEEE d MMM' · 'HH'h'", { locale: fr })

  return (
    <div
      className={
        compact || hero
          ? 'flex flex-col gap-3'
          : 'grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start'
      }
    >
      {/* ── Modèle, avec le score en surimpression ── */}
      <Card padded={false} className={`relative ${hero ? 'hero-stage' : ''}`}>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4 transition-opacity duration-300"
          style={{ opacity: deep ? 0 : 1 }}
        >
          <div>
            <div className="text-[0.62rem] tracking-[0.18em] text-mist-500 uppercase">
              Disponibilité
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[2.1rem] leading-none font-semibold tnum"
                style={{ color: fatigueColor(100 - availability) }}
              >
                {Math.round(availability)}
              </span>
              <span className="text-xs text-mist-500">/ 100</span>
            </div>
          </div>
          <div className="text-right text-[0.65rem] text-mist-500">
            <div className="capitalize">{timeLabel}</div>
            {!use3d && <div className="mt-0.5 text-mist-700">Vue 2D</div>}
          </div>
        </div>

        <div
          className="relative w-full"
          style={{
            height: hero ? 'clamp(400px, 66vh, 780px)' : compact ? 300 : 'clamp(340px, 56vh, 560px)',
          }}
        >
          {hero && <div className="hero-scan transition-opacity duration-500" style={{ opacity: deep ? 0 : 1 }} aria-hidden />}
          {!compact && use3d && (
            <>
              <p
                className="pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center text-[0.62rem] tracking-wide text-mist-700 transition-opacity duration-300"
                style={{ opacity: deep ? 0 : 1 }}
              >
                {low ? 'Écarte deux doigts' : 'Zoome à la molette sur la tête'} pour entrer dans le cerveau
              </p>
              <div className="pointer-events-none absolute inset-0 z-10" data-deep={deep ? 'true' : 'false'}>
                <NeuralHud model={neuralModel} deep={deep} onBack={() => diveTo(0)} />
              </div>
            </>
          )}
          {use3d ? (
            render3d ? (
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-xs text-mist-700">
                    Chargement du modèle…
                  </div>
                }
              >
                <Body3D
                  body={body}
                  layer={layer}
                  selected={selected}
                  onSelect={(z) => setSelected(z)}
                  azimuth={azimuth}
                  sleepScore={data.sleepScore.score}
                  cardioScore={data.cardioScore.score}
                  restingHr={data.checkinByDay.get(data.today)?.restingHr ?? null}
                  jointLoad={jointColors}
                  quality={low ? 'low' : 'high'}
                  compact={compact}
                  hero={hero}
                  diveCommand={diveCommand}
                  onDeep={setDeep}
                  neural={
                    compact
                      ? undefined
                      : {
                          graph: neuralModel.graph,
                          positions: neuralModel.positions,
                          hovered: neuralModel.hovered,
                          setHovered: neuralModel.setHovered,
                          onPick: neuralModel.pick,
                          labels: neuralModel.labels,
                        }
                  }
                />
              </Suspense>
            ) : (
              <div className="grid h-full place-items-center text-xs text-mist-700">…</div>
            )
          ) : (
            <div className="h-full px-2 pt-16 pb-3">
              <Body2D
                body={body}
                selected={
                  typeof selected === 'string' && MUSCLE_ZONES.includes(selected as MuscleZone)
                    ? (selected as MuscleZone)
                    : null
                }
                onSelect={(z) => setSelected(z)}
                single={compact ? 'front' : undefined}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented value={layer} onChange={setLayer} options={LAYERS} size="sm" />
            {!compact && use3d && (
              <button
                onClick={() => diveTo(deep ? 0 : 1)}
                className="flex items-center gap-1.5 rounded-xl bg-accent/12 px-3 py-1.5 text-xs text-accent shadow-[inset_0_0_0_1px_var(--accent-soft)] transition active:scale-95"
                title="Zoomer jusqu'aux neurones (ou à la molette sur la tête)"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                {deep ? 'Corps' : 'Réseau'}
              </button>
            )}
          </div>
          {use3d && (
            <div className="flex gap-1">
              <Button
                variant={Math.abs(azimuth % (Math.PI * 2)) < 0.3 ? 'primary' : 'soft'}
                className="px-3 py-1.5 text-xs"
                onClick={() => setAzimuth(0)}
              >
                Face
              </Button>
              <Button
                variant={Math.abs((azimuth % (Math.PI * 2)) - Math.PI) < 0.3 ? 'primary' : 'soft'}
                className="px-3 py-1.5 text-xs"
                onClick={() => setAzimuth(Math.PI)}
              >
                Dos
              </Button>
            </div>
          )}
        </div>

        {!hero && (
          <>
        {/* ── Contrôles temporels ── */}
        <div className="flex flex-col gap-2 border-t border-white/8 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={String(horizon)}
              onChange={(v) => setHorizon(Number(v))}
              options={HORIZONS.map((h) => ({ value: String(h.value), label: h.label }))}
              size="sm"
            />
            <button
              onClick={() => {
                setPlaying((p) => !p)
                if (playing) setDayOffset(0)
              }}
              className="flex items-center gap-1.5 rounded-xl bg-white/6 px-3 py-1.5 text-xs text-mist-300 hairline"
            >
              {playing ? '■ Arrêter' : '▶ Dernière semaine'}
            </button>
          </div>
          <label className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-[0.62rem] tracking-wide text-mist-500 uppercase">
              Remonter
            </span>
            <input
              type="range"
              min={-30}
              max={0}
              step={1}
              value={Math.round(dayOffset)}
              onChange={(e) => {
                setPlaying(false)
                setDayOffset(Number(e.target.value))
              }}
              className="flex-1"
              style={{ ['--thumb' as string]: 'var(--accent)' }}
            />
            <span className="w-12 shrink-0 text-right text-xs text-mist-300 tnum">
              {Math.round(dayOffset) === 0 ? 'auj.' : `J${Math.round(dayOffset)}`}
            </span>
          </label>
        </div>
          </>
        )}
      </Card>

      {!hero && (
        <>
      {/* ── Résumé & détails ── */}
      <div className="flex flex-col gap-3">
      <Card>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-xl bg-white/4 p-2.5 hairline">
            <div className="mb-1 flex items-center gap-1.5 text-[0.62rem] tracking-wide text-mist-500 uppercase">
              <Dot color="#41e08a" /> Prêt pour du lourd
            </div>
            <div className="text-mist-100">
              {summary.ready.length ? zoneList(summary.ready, 6) : 'Rien de totalement frais'}
            </div>
          </div>
          <div className="rounded-xl bg-white/4 p-2.5 hairline">
            <div className="mb-1 flex items-center gap-1.5 text-[0.62rem] tracking-wide text-mist-500 uppercase">
              <Dot color="#ff8f45" /> À ménager
            </div>
            <div className="text-mist-100">
              {summary.careful.length ? zoneList(summary.careful, 6) : 'Aucune zone chargée'}
            </div>
          </div>
        </div>
        {suggestion && (
          <div className="mt-2 rounded-xl bg-accent/8 p-2.5 text-xs hairline">
            <span className="text-mist-500">Idée du jour · </span>
            <span className="font-medium text-accent">{suggestion.title}</span>
            <span className="text-mist-300"> — {suggestion.sentence}</span>
          </div>
        )}
      </Card>

      {!compact && (
        <>
          <WhyCard body={body} onSelect={setSelected} />
          <ZoneGrid body={body} onSelect={setSelected} />
          <Card title="Organes & articulations" subtitle="Touche un élément pour le détail">
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setSelected('cerveau')}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs hairline"
              >
                <Dot color={fatigueColor(100 - data.sleepScore.score)} /> Cerveau ·{' '}
                {Math.round(data.sleepScore.score)}
              </button>
              <button
                onClick={() => setSelected('coeur')}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs hairline"
              >
                <Dot color={fatigueColor(100 - data.cardioScore.score)} /> Cœur ·{' '}
                {Math.round(data.cardioScore.score)}
              </button>
              {JOINTS_LIST.map((j) => (
                <button
                  key={j}
                  onClick={() => setSelected(j)}
                  className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs hairline"
                >
                  <Dot color={joints[j].color} /> {JOINT_LABEL[j]}
                </button>
              ))}
            </div>
          </Card>
        </>
      )}
      </div>
        </>
      )}

      {!compact && <NeuralModals model={neuralModel} />}

      <DetailSheet
        selection={selected}
        onClose={() => setSelected(null)}
        body={body}
        joints={joints}
      />
    </div>
  )
}

/* ── Pourquoi ces zones sont chargées ─────────────────────────────────── */

function WhyCard({
  body,
  onSelect,
}: {
  body: ReturnType<typeof fatigueAt>
  onSelect: (z: MuscleZone) => void
}) {
  const data = useSoma()
  const hot = MUSCLE_ZONES.filter((z) => body[z].hasHistory && body[z].value >= 55).sort(
    (a, b) => body[b].value - body[a].value,
  )
  if (!hot.length) return null
  const rc = {
    sleepHours: data.sleepScore.hours,
    sleepScore: data.sleepScore.score,
    recovery: data.checkinByDay.get(data.today)?.recovery ?? null,
  }
  return (
    <Card title="Pourquoi ces zones sont chargées" subtitle="Touche une zone pour le détail complet">
      <div className="mt-3 space-y-2">
        {hot.map((z) => {
          const f = body[z]
          const color = fatigueColor(f.value)
          const lines = explainZone(z, body, rc)
          return (
            <button
              key={z}
              onClick={() => onSelect(z)}
              className="flex w-full gap-3 rounded-xl bg-white/4 p-3 text-left hairline active:scale-[0.99]"
            >
              <span className="w-1 shrink-0 rounded-full" style={{ background: color }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-mist-100">{ZONE_LABEL[z]}</span>
                  <span className="text-sm font-medium tnum" style={{ color }}>
                    {Math.round(f.value)} %
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-mist-300">{lines[0]}</span>
                {f.readyInHours ? (
                  <span className="mt-0.5 block text-[0.68rem] text-mist-700">
                    Retour au vert dans ~{f.readyInHours} h
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* ── Grille des zones ─────────────────────────────────────────────────── */

function ZoneGrid({
  body,
  onSelect,
}: {
  body: ReturnType<typeof fatigueAt>
  onSelect: (z: MuscleZone) => void
}) {
  const sorted = [...MUSCLE_ZONES].sort((a, b) => body[b].value - body[a].value)
  return (
    <Card title="Toutes les zones" subtitle="Triées de la plus chargée à la plus fraîche">
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((z) => {
          const f = body[z]
          const color = fatigueColor(f.value, f.hasHistory)
          return (
            <button
              key={z}
              onClick={() => onSelect(z)}
              className="flex items-center gap-2 rounded-xl bg-white/4 px-2.5 py-2 text-left transition hairline active:scale-[0.98]"
            >
              <span
                className="h-7 w-1 shrink-0 rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}99` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.72rem] text-mist-300">{ZONE_SHORT[z]}</span>
                <span className="text-[0.65rem] text-mist-700">
                  {f.hasHistory ? BAND_LABEL[fatigueBand(f.value)] : 'Pas de données'}
                </span>
              </span>
              <span className="text-sm font-medium tnum" style={{ color }}>
                {f.hasHistory ? Math.round(f.value) : '—'}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/* ── Panneaux de détail ──────────────────────────────────────────────── */

function DetailSheet({
  selection,
  onClose,
  body,
  joints,
}: {
  selection: Selection
  onClose: () => void
  body: ReturnType<typeof fatigueAt>
  joints: ReturnType<typeof allJointInfo>
}) {
  const data = useSoma()
  const open = selection !== null
  const title =
    selection === null
      ? ''
      : selection === 'cerveau'
        ? 'Cerveau — sommeil'
        : selection === 'coeur'
          ? 'Cœur & poumons'
          : JOINTS_LIST.includes(selection as Joint)
            ? JOINT_LABEL[selection as Joint]
            : ZONE_LABEL[selection as MuscleZone]

  return (
    <Sheet open={open} onClose={onClose} title={title} wide>
      {selection === 'cerveau' && <BrainPanel />}
      {selection === 'coeur' && <HeartPanel />}
      {selection !== null && JOINTS_LIST.includes(selection as Joint) && (
        <JointPanel joint={selection as Joint} info={joints[selection as Joint]} />
      )}
      {selection !== null &&
        MUSCLE_ZONES.includes(selection as MuscleZone) && (
          <ZonePanel zone={selection as MuscleZone} body={body} data={data} />
        )}
    </Sheet>
  )
}

function ZonePanel({
  zone,
  body,
  data,
}: {
  zone: MuscleZone
  body: ReturnType<typeof fatigueAt>
  data: ReturnType<typeof useSoma>
}) {
  const f = body[zone]
  const color = fatigueColor(f.value, f.hasHistory)
  const isLeg = LEG_ZONES.includes(zone)
  const week = lastDays(data.today, 7)
  const legs = useMemo(() => {
    if (!isLeg) return null
    const workouts = data.workouts.filter((w) => week.includes(w.day))
    const v = volumeSummary(workouts, data.loadCtx)
    const impact = workouts
      .filter((w) => w.kind === 'course' || w.cardio?.modality === 'corde_a_sauter')
      .reduce((s, w) => s + (w.run?.distanceM ?? 0) / 1000 + w.durationMin * 0.05, 0)
    return { km: v.km, elevation: v.elevationM, impact }
  }, [isLeg, data.workouts, data.loadCtx, week])

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-end gap-4">
        <div>
          <div className="text-4xl font-semibold tnum" style={{ color }}>
            {f.hasHistory ? Math.round(f.value) : '—'}
            <span className="ml-1 text-base text-mist-500">%</span>
          </div>
          <Badge color={color} className="mt-1">
            {BAND_LABEL[fatigueBand(f.value, f.hasHistory)]}
          </Badge>
        </div>
        <div className="flex-1 text-right text-xs text-mist-500">
          {f.hasHistory ? (
            f.readyInHours === 0 ? (
              <span className="text-[#41e08a]">Prêt maintenant</span>
            ) : f.readyInHours === null ? (
              'Prêt dans plus de 15 jours'
            ) : (
              <>
                Prêt dans environ{' '}
                <span className="font-medium text-mist-100">{f.readyInHours} h</span>
              </>
            )
          ) : (
            'Aucune séance enregistrée'
          )}
        </div>
      </div>

      <p className="rounded-xl bg-white/4 p-3 text-sm text-mist-300 hairline">
        {zoneSentence(zone, body)}
      </p>

      <div>
        <h4 className="mb-2 text-[0.68rem] tracking-wider text-mist-500 uppercase">
          Pourquoi cette couleur ?
        </h4>
        <ul className="space-y-1.5 rounded-xl bg-white/4 p-3 text-xs text-mist-300 hairline">
          {explainZone(zone, body, {
            sleepHours: data.sleepScore.hours,
            sleepScore: data.sleepScore.score,
            recovery: data.checkinByDay.get(data.today)?.recovery ?? null,
          }).map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-mist-700">•</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="Volume 7 jours"
            value={f.load7d.toFixed(1)}
            unit="u"
            hint={`Moyenne 4 sem. : ${f.load28dAvg7d.toFixed(1)} u`}
          />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="Écart à l’habitude"
            value={
              f.load28dAvg7d > 0.05
                ? `${f.load7d >= f.load28dAvg7d ? '+' : ''}${Math.round(
                    ((f.load7d - f.load28dAvg7d) / f.load28dAvg7d) * 100,
                  )}`
                : '—'
            }
            unit="%"
          />
        </div>
      </div>

      {legs && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="Km 7 j" value={legs.km.toFixed(1)} unit="km" />
          </div>
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="D+ 7 j" value={Math.round(legs.elevation)} unit="m" />
          </div>
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="Impact cumulé" value={Math.round(legs.impact)} unit="u" />
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-[0.68rem] tracking-wider text-mist-500 uppercase">
          Séances qui y contribuent
        </h4>
        {f.contributors.length ? (
          <ul className="space-y-1.5">
            {f.contributors.map((c) => (
              <li
                key={c.workoutId + c.startedAt}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2 text-xs hairline"
              >
                <span className="min-w-0">
                  <span className="block truncate text-mist-100">{c.label}</span>
                  <span className="text-mist-700">
                    {format(toDate(c.startedAt), "EEE d MMM 'à' HH'h'mm", { locale: fr })}
                  </span>
                </span>
                <span className="shrink-0 text-mist-500 tnum">{agoLabel(c.hoursAgo)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-mist-700">Aucune séance récente sur cette zone.</p>
        )}
      </div>
    </div>
  )
}

function BrainPanel() {
  const data = useSoma()
  const s = data.sleepScore
  const c = data.checkinByDay.get(data.today)
  const total = (c?.sleep?.lightMin ?? 0) + (c?.sleep?.deepMin ?? 0) + (c?.sleep?.remMin ?? 0)
  const phases = [
    { label: 'Léger', min: c?.sleep?.lightMin ?? 0, color: '#8fb4ff' },
    { label: 'Profond', min: c?.sleep?.deepMin ?? 0, color: '#9b7bff' },
    { label: 'Paradoxal', min: c?.sleep?.remMin ?? 0, color: '#27e0c0' },
    { label: 'Éveillé', min: c?.sleep?.awakeMin ?? 0, color: '#4f5f7a' },
  ]
  const days = lastDays(data.today, 14)
  const trend = days.map((d) => ({
    day: d,
    value: computeSleepScore(data.checkinByDay, d, data.settings.sleepGoalHours).score,
  }))
  const reg = sleepRegularity(data.checkinByDay, data.today)
  const goalReached = (s.hours ?? 0) >= data.settings.sleepGoalHours

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-4xl font-semibold tnum"
            style={{ color: fatigueColor(100 - s.score) }}
          >
            {Math.round(s.score)}
            <span className="ml-1 text-base text-mist-500">/ 100</span>
          </div>
          <div className="mt-1 text-xs text-mist-500">
            {s.hours !== null ? `${s.hours.toFixed(1)} h de sommeil` : 'Nuit non renseignée'}
          </div>
        </div>
        <Badge color={goalReached ? '#41e08a' : '#ffc24b'}>
          {goalReached ? 'Objectif atteint' : `Objectif ${data.settings.sleepGoalHours} h`}
        </Badge>
      </div>

      {total > 0 && (
        <div>
          <h4 className="mb-2 text-[0.68rem] tracking-wider text-mist-500 uppercase">Phases</h4>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
            {phases.map((p) => (
              <div
                key={p.label}
                style={{ width: `${(p.min / Math.max(1, total)) * 100}%`, background: p.color }}
                title={`${p.label} ${p.min} min`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[0.68rem] text-mist-500">
            {phases.map((p) => (
              <span key={p.label} className="flex items-center gap-1.5">
                <Dot color={p.color} size={6} /> {p.label} {Math.round(p.min)} min
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat label="Dette 7 j" value={s.debtHours7d.toFixed(1)} unit="h" />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat label="Régularité" value={reg === null ? '—' : Math.round(reg)} unit="%" />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="Efficacité"
            value={c?.sleep?.efficiency ? Math.round(c.sleep.efficiency) : '—'}
            unit="%"
          />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat label="Réveils" value={c?.sleep?.awakenings ?? '—'} />
        </div>
      </div>

      <div>
        <h4 className="mb-1 text-[0.68rem] tracking-wider text-mist-500 uppercase">
          Tendance 14 jours
        </h4>
        <Spark data={trend} color="#9b7bff" baseline={mean(trend.map((t) => t.value))} />
      </div>

      <div className="space-y-1 text-[0.7rem] text-mist-700">
        <div>Durée vs objectif : {Math.round(s.durationPart)} / 40</div>
        <div>Profond + paradoxal : {Math.round(s.stagesPart)} / 25</div>
        <div>Efficacité : {Math.round(s.efficiencyPart)} / 15</div>
        <div>Régularité : {Math.round(s.consistencyPart)} / 10</div>
        <div>Dette : {Math.round(s.debtPart)} / 10</div>
      </div>
    </div>
  )
}

function HeartPanel() {
  const data = useSoma()
  const s = data.cardioScore
  const c = data.checkinByDay.get(data.today)
  const days = lastDays(data.today, 30)
  const rhrTrend = days
    .map((d) => ({ day: d, value: data.checkinByDay.get(d)?.restingHr ?? 0 }))
    .filter((p) => p.value > 0)
  const hrvTrend = days
    .map((d) => ({ day: d, value: data.checkinByDay.get(d)?.hrv ?? 0 }))
    .filter((p) => p.value > 0)

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="text-4xl font-semibold tnum"
            style={{ color: fatigueColor(100 - s.score) }}
          >
            {Math.round(s.score)}
            <span className="ml-1 text-base text-mist-500">/ 100</span>
          </div>
          <div className="mt-1 text-xs text-mist-500">Score cardio du jour</div>
        </div>
        <div className="text-right text-xs text-mist-500">
          {s.highZoneMinutes7d > 0 && (
            <>
              <div className="text-mist-100 tnum">{Math.round(s.highZoneMinutes7d)} min</div>
              <div>en zones 4-5 sur 7 j</div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="FC repos"
            value={c?.restingHr ?? '—'}
            unit="bpm"
            hint={s.rhrBaseline ? `base ${Math.round(s.rhrBaseline)}` : undefined}
          />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="HRV"
            value={c?.hrv ?? '—'}
            unit="ms"
            hint={s.hrvBaseline ? `base ${Math.round(s.hrvBaseline)}` : undefined}
          />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="Écart HRV"
            value={s.hrvDeltaPct === null ? '—' : `${s.hrvDeltaPct > 0 ? '+' : ''}${Math.round(s.hrvDeltaPct)}`}
            unit="%"
            color={s.hrvDeltaPct !== null && s.hrvDeltaPct < -10 ? '#ffc24b' : undefined}
          />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat
            label="Écart FC repos"
            value={s.rhrDelta === null ? '—' : `${s.rhrDelta > 0 ? '+' : ''}${s.rhrDelta.toFixed(1)}`}
            unit="bpm"
          />
        </div>
      </div>

      {(c?.respiratoryRate || c?.spo2) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="Fréq. respiratoire" value={c?.respiratoryRate ?? '—'} unit="/min" />
          </div>
          <div className="rounded-xl bg-white/4 p-3 hairline">
            <Stat label="SpO₂" value={c?.spo2 ?? '—'} unit="%" />
          </div>
        </div>
      )}

      {rhrTrend.length > 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-[0.68rem] tracking-wider text-mist-500 uppercase">
              FC repos · 30 j
            </h4>
            <Spark data={rhrTrend} color="#ff8f45" baseline={s.rhrBaseline ?? undefined} />
          </div>
          <div>
            <h4 className="mb-1 text-[0.68rem] tracking-wider text-mist-500 uppercase">HRV · 30 j</h4>
            <Spark data={hrvTrend} color="#27e0c0" baseline={s.hrvBaseline ?? undefined} />
          </div>
        </div>
      )}
    </div>
  )
}

function JointPanel({ joint, info }: { joint: Joint; info: ReturnType<typeof allJointInfo>[Joint] }) {
  const data = useSoma()
  const debt = sleepDebtHours(data.checkinByDay, data.today, data.settings.sleepGoalHours)
  const hours = sleepHours(data.checkinByDay.get(addDayKey(data.today, 0)))
  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-end gap-3">
        <Badge color={info.color}>{info.label}</Badge>
        <span className="text-xs text-mist-500">
          {info.ratio > 0 ? `Ratio 7 j / 28 j : ${info.ratio.toFixed(2)}` : 'Pas encore de charge'}
        </span>
      </div>
      <p className="rounded-xl bg-white/4 p-3 text-sm text-mist-300 hairline">
        {info.ratio <= 1.15
          ? `${JOINT_LABEL[joint]} : rien de particulier, la charge reste dans tes habitudes.`
          : `${JOINT_LABEL[joint]} : la charge des 7 derniers jours dépasse ta moyenne de 4 semaines. Rien d’alarmant, mais une semaine plus stable serait confortable.`}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat label="Charge 7 j" value={info.load7d.toFixed(1)} unit="u" />
        </div>
        <div className="rounded-xl bg-white/4 p-3 hairline">
          <Stat label="Base 7 j (28 j)" value={info.base7d.toFixed(1)} unit="u" />
        </div>
      </div>
      <p className="text-[0.7rem] text-mist-700">
        Récupération tissulaire et sommeil vont ensemble : {hours ? `${hours.toFixed(1)} h` : 'nuit non notée'}
        {debt > 2 ? `, dette de ${debt.toFixed(1)} h sur 7 jours.` : '.'}
      </p>
    </div>
  )
}
