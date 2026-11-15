import { useMemo, useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import { Card, ProgressBar, Select, Stat } from '../components/ui/primitives'
import { navigate } from '../lib/router'
import { STATUS_COLOR } from '../engine/goals'
import { DEFAULT_RECORD_ROWS } from '../engine/records'
import { Bars, Donut, RadarProfile, SmoothLines } from '../components/charts/charts'
import { exerciseRecords } from '../engine/load'
import { addDayKey, lastDays } from '../engine/time'
import { sleepRegularity } from '../engine/sleep'
import { movingAverage } from '../engine/stats'
import {
  buildInsights, consistency, perceivedVsMeasured, perceptionGap, polarisation, recoveryAfterStrain,
  proteinCheck, recoveryBySleep, recoveryByWeekday, recoveryProfile, sleepStageShare, streakWeeks, trendOf, weeklyEffort, zoneTotals,
  type Insight,
} from '../engine/performance'

const TONE: Record<Insight['tone'], string> = { good: '#41e08a', watch: '#ffc24b', info: '#8fb4ff' }
const DAY_LABEL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

type Tone = 'good' | 'watch' | 'info'

/** L'essentiel en deux secondes : un verdict en gros, quatre chiffres clés. Le détail vient en dessous. */
function Headline({ tone, title, text, tiles }: { tone: Tone; title: string; text: string; tiles: { label: string; value: string; unit?: string; sub?: string; tone?: Tone }[] }) {
  return (
    <Card className="lg:col-span-2">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: TONE[tone], boxShadow: `0 0 12px ${TONE[tone]}` }} />
        <div>
          <p className="text-lg leading-tight font-semibold text-mist-100 sm:text-xl">{title}</p>
          <p className="mt-0.5 text-sm text-mist-300">{text}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white/4 px-4 py-3 hairline">
            <div className="text-[0.68rem] tracking-wide text-mist-500 uppercase">{t.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-3xl leading-none font-semibold tnum" style={{ color: t.tone ? TONE[t.tone] : 'var(--color-mist-100)' }}>{t.value}</span>
              {t.unit && <span className="text-sm text-mist-500">{t.unit}</span>}
            </div>
            {t.sub && <div className="mt-1 text-[0.7rem] text-mist-500">{t.sub}</div>}
          </div>
        ))}
      </div>
    </Card>
  )
}

const r0 = (v: number | null) => (v === null ? '—' : String(Math.round(v)))

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-xs text-mist-500">{children}</p>
}

/** Les constats les plus importants, classés : à placer en haut de l'aperçu. */
export function InsightsCard({ max = 4 }: { max?: number }) {
  const data = useSoma()
  const items = useMemo(
    () => buildInsights({ byDay: data.checkinByDay, workouts: data.workouts, today: data.today, weekStart: data.settings.weekStartsOn, sleepGoal: data.settings.sleepGoalHours }),
    [data.checkinByDay, data.workouts, data.today, data.settings.weekStartsOn, data.settings.sleepGoalHours],
  )
  const goal = data.settings.countdown
  const left = goal ? Math.ceil((new Date(`${goal.date}T12:00:00`).getTime() - new Date(`${data.today}T12:00:00`).getTime()) / 86_400_000) : null
  return (
    <Card title="Ce qui ressort" subtitle={goal && left !== null && left >= 0 ? `${goal.name} · J-${left}` : 'Classé par importance pour ta progression'}>
      {items.length === 0 ? (
        <Empty>Pas encore assez de données : quelques jours de WHOOP et de séances suffisent.</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, max).map((i) => (
            <li key={i.id} className="rounded-xl bg-white/4 p-3 hairline" style={{ borderLeft: `3px solid ${TONE[i.tone]}` }}>
              <p className="text-sm font-medium text-mist-100">{i.title}</p>
              <p className="mt-0.5 text-xs text-mist-300">{i.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Ce que l'appli sait de toi pour personnaliser les conseils : niveau, habitudes, protéines. */
function ProfileCard() {
  const data = useSoma()
  const s = data.settings
  const w = s.weightKg ?? 70
  const prot = s.proteinG ? proteinCheck(s.proteinG, w) : null
  return (
    <Card className="lg:col-span-2" title="Conseils adaptés à toi" subtitle="Les repères de récupération sont comparés à TA moyenne (pas à une moyenne générale)" action={<button onClick={() => navigate('reglages')} className="text-xs text-accent">Modifier mon profil →</button>}>
      <ul className="mt-3 grid gap-2 text-xs text-mist-300 sm:grid-cols-3">
        <li className="rounded-xl bg-white/4 px-3 py-2 hairline">
          <div className="text-[0.65rem] tracking-wide text-mist-500 uppercase">Entraînement</div>
          <div className="text-sm text-mist-100">{s.trainingYears !== undefined ? `${s.trainingYears} an${s.trainingYears >= 2 ? 's' : ''}` : 'à renseigner'} · repos tous les {s.restEvery ?? 3} jours</div>
        </li>
        <li className="rounded-xl bg-white/4 px-3 py-2 hairline">
          <div className="text-[0.65rem] tracking-wide text-mist-500 uppercase">Protéines</div>
          <div className="text-sm text-mist-100">{s.proteinG ? `~${s.proteinG} g / jour · ${prot!.perKg.toFixed(1)} g/kg` : 'à renseigner'}</div>
          {prot && <div className="mt-0.5 text-[0.68rem] text-mist-500">{prot.verdict === 'bas' ? `Repère pour progresser en force : ${prot.low} à ${prot.high} g. Tu es un peu en dessous : ça peut ralentir la récupération musculaire.` : prot.verdict === 'ok' ? 'Dans la plage utile pour progresser en force.' : 'Au-dessus du nécessaire : pas de bénéfice supplémentaire.'}</div>}
        </li>
        <li className="rounded-xl bg-white/4 px-3 py-2 hairline">
          <div className="text-[0.65rem] tracking-wide text-mist-500 uppercase">Ce qui est personnalisé</div>
          <div className="mt-0.5 text-[0.68rem] text-mist-500">VFC, FC de repos et récupération : comparées à ta base des 30 derniers jours. Sommeil : à ton objectif d’heures. Phases de sommeil : normes générales.</div>
        </li>
      </ul>
    </Card>
  )
}

export function RecoveryTab() {
  const data = useSoma()
  const { checkinByDay: by, today } = data
  const days = useMemo(() => lastDays(today, 60), [today])
  const profile = useMemo(() => recoveryProfile(by, today), [by, today])
  const stages = useMemo(() => sleepStageShare(by, today), [by, today])
  const afterStrain = useMemo(() => recoveryAfterStrain(by, today), [by, today])
  const bySleep = useMemo(() => recoveryBySleep(by, today), [by, today])
  const weekday = useMemo(() => recoveryByWeekday(by, today), [by, today])
  const series = useMemo(() => {
    const rec = days.map((d) => by.get(d)?.recovery ?? null)
    const hrv = days.map((d) => by.get(d)?.hrv ?? null)
    const rhr = days.map((d) => by.get(d)?.restingHr ?? null)
    const r7 = movingAverage(rec, 7)
    const h7 = movingAverage(hrv, 7)
    const f7 = movingAverage(rhr, 7)
    return days.map((day, i) => ({ day, recup: rec[i], tendance: r7[i], vfc: h7[i], fc: f7[i] }))
  }, [days, by])
  const stageSeries = useMemo(() => lastDays(today, 21).map((day) => {
    const s = by.get(day)?.sleep
    return { day, profond: s?.deepMin ? s.deepMin / 60 : null, paradoxal: s?.remMin ? s.remMin / 60 : null, leger: s?.lightMin ? s.lightMin / 60 : null }
  }), [by, today])
  const reg = useMemo(() => sleepRegularity(by, today), [by, today])
  const radar = useMemo(() => {
    const clamp = (v: number) => Math.max(0, Math.min(100, v))
    const rel = (p: (typeof profile)[number], good: boolean) => (p.now === null || p.base === null ? 0 : clamp(60 + (good ? 1 : -1) * (p.deltaPct ?? 0) * 3))
    const [rec, hrv, rhr, slp] = profile
    return [
      { axis: 'Récup', value: rec.now === null ? 0 : clamp(rec.now) },
      { axis: 'VFC', value: rel(hrv, true) },
      { axis: 'FC repos', value: rel(rhr, false) },
      { axis: 'Sommeil', value: slp.now === null ? 0 : clamp((slp.now / data.settings.sleepGoalHours) * 100) },
      ...(reg !== null ? [{ axis: 'Régularité', value: clamp(reg) }] : []),
    ]
  }, [profile, data.settings.sleepGoalHours, reg])
  const hasAny = days.some((d) => by.get(d)?.recovery !== undefined)

  const [pRec, pHrv, , pSleep] = profile
  const deepPct = stages?.deep ?? null
  const goalH = data.settings.sleepGoalHours
  const recTone: Tone = pRec.now === null ? 'info' : pRec.now >= 67 ? 'good' : pRec.now >= 34 ? 'info' : 'watch'
  const headline = pRec.now === null ? 'En attente des données WHOOP' : pRec.now >= 67 ? 'Tu récupères bien' : pRec.now >= 34 ? 'Récupération moyenne' : 'Ton corps demande du calme'
  const hrvWord = pHrv.deltaPct === null ? '' : ` VFC ${pHrv.deltaPct >= 0 ? 'en hausse' : 'en baisse'} (${pHrv.deltaPct >= 0 ? '+' : ''}${pHrv.deltaPct.toFixed(0)} %).`
  const sleepWord = pSleep.now === null ? '' : ` Nuits de ${pSleep.now.toFixed(1)} h pour ${goalH} h visées.`
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Headline tone={recTone} title={headline} text={`Moyenne des 7 derniers jours.${hrvWord}${sleepWord}`.trim()} tiles={[
        { label: 'Récupération', value: r0(pRec.now), unit: '%', sub: 'moyenne 7 jours', tone: pRec.now === null ? undefined : pRec.now >= 67 ? 'good' : pRec.now >= 34 ? 'info' : 'watch' },
        { label: 'VFC', value: r0(pHrv.now), unit: 'ms', sub: pHrv.base === null ? undefined : `ta base : ${Math.round(pHrv.base)} ms`, tone: pHrv.deltaPct === null ? undefined : pHrv.deltaPct >= 0 ? 'good' : 'watch' },
        { label: 'Nuit moyenne', value: pSleep.now === null ? '—' : pSleep.now.toFixed(1), unit: 'h', sub: `objectif ${goalH} h`, tone: pSleep.now === null ? undefined : pSleep.now >= goalH - 0.25 ? 'good' : 'watch' },
        { label: 'Sommeil profond', value: deepPct === null ? '—' : deepPct.toFixed(0), unit: '%', sub: 'de la nuit · norme 13 – 23 %', tone: deepPct === null ? undefined : deepPct >= 13 ? 'good' : 'watch' },
      ]} />
      <ProfileCard />
      <Card title="Forme du moment" subtitle="7 derniers jours comparés à ta base de 30 jours">
        <RadarProfile data={radar} height={210} />
      </Card>

      <Card title="Récupération" subtitle="60 jours, avec moyenne sur 7 jours">
        {hasAny ? (
          <SmoothLines data={series} series={[{ key: 'recup', color: '#41e08a55', name: 'Récup', unit: '%' }, { key: 'tendance', color: '#41e08a', name: 'Tendance 7 j', unit: '%' }]} yDomain={[0, 100]} height={200} />
        ) : <Empty>La récupération apparaît dès que WHOOP est connecté.</Empty>}
      </Card>

      <Card title="VFC et FC de repos" subtitle="Moyennes sur 7 jours : la VFC monte et la FC baisse quand tu progresses">
        <SmoothLines data={series} series={[{ key: 'vfc', color: '#27e0c0', name: 'VFC', unit: 'ms' }, { key: 'fc', color: '#ff8f45', name: 'FC repos', unit: 'bpm' }]} height={200} />
      </Card>

      <Card title="Qualité du sommeil" subtitle="Phases par nuit, 21 jours (heures)">
        <Bars data={stageSeries} stacked series={[{ key: 'profond', color: '#6b4bff', name: 'Profond', unit: 'h' }, { key: 'paradoxal', color: '#27e0c0', name: 'Paradoxal', unit: 'h' }, { key: 'leger', color: '#4f5f7a', name: 'Léger', unit: 'h' }]} height={190} />
        {stages && (
          <div className="mt-3">
            <Donut height={110} parts={[{ name: 'Profond', value: stages.deep, color: '#6b4bff' }, { name: 'Paradoxal', value: stages.rem, color: '#27e0c0' }, { name: 'Léger', value: stages.light, color: '#4f5f7a' }, { name: 'Éveillé', value: stages.awake, color: '#ff8f45' }]} />
            <p className="mt-2 text-[0.68rem] text-mist-500">Moyenne sur {stages.nights} nuits. Repères : profond 13 – 23 %, paradoxal 20 – 25 %.</p>
          </div>
        )}
      </Card>

      <Card title="Ce qui te fait récupérer" subtitle="Récupération moyenne selon la nuit et selon l’effort de la veille">
        <p className="mt-3 mb-1 text-xs text-mist-300">Après X heures de sommeil</p>
        <Bars data={bySleep.map((b) => ({ label: b.label, v: b.value === null ? null : Math.round(b.value) }))} series={[{ key: 'v', color: '#9b7bff', name: 'Récup', unit: '%' }]} yDomain={[0, 100]} height={130} hideY xKey="label" />
        <p className="mt-3 mb-1 text-xs text-mist-300">Après un effort (strain WHOOP)</p>
        <Bars data={afterStrain.map((b) => ({ label: b.label, v: b.value === null ? null : Math.round(b.value) }))} series={[{ key: 'v', color: '#ff8f45', name: 'Récup J+1', unit: '%' }]} yDomain={[0, 100]} height={130} hideY xKey="label" />
      </Card>

      <Card title="Selon le jour de la semaine" subtitle="Récupération moyenne sur 90 jours">
        <Bars data={weekday.map((v, i) => ({ label: DAY_LABEL[i], v: v === null ? null : Math.round(v) }))} series={[{ key: 'v', color: 'var(--accent)', name: 'Récup', unit: '%' }]} colorByValue={(v) => (v >= 67 ? '#41e08a' : v >= 34 ? '#ffc24b' : '#ff5a5a')} yDomain={[0, 100]} height={150} xKey="label" />
      </Card>
    </div>
  )
}

export function EffortTab() {
  const data = useSoma()
  const { today } = data
  const weeks = useMemo(() => weeklyEffort(data.workouts, today, 10, data.settings.weekStartsOn), [data.workouts, today, data.settings.weekStartsOn])
  const zones = useMemo(() => zoneTotals(data.workouts, today, 28), [data.workouts, today])
  const pol = polarisation(zones)
  const pairs = useMemo(() => perceivedVsMeasured(data.workouts).slice(-12), [data.workouts])
  const gap = perceptionGap(perceivedVsMeasured(data.workouts))
  const strainSeries = useMemo(() => lastDays(today, 30).map((d) => ({ day: d, strain: data.checkinByDay.get(d)?.whoopDayStrain ?? null })), [today, data.checkinByDay])
  const rpeWeeks = weeks.map((w) => ({ day: w.start, rpe: w.rpe === null ? null : Math.round(w.rpe * 10) / 10 }))
  const total = zones.reduce((a, b) => a + b, 0)
  const zoneColors = ['#4f5f7a', '#27e0c0', '#41e08a', '#ffc24b', '#ff8f45']

  const cur = weeks[weeks.length - 1]
  const prev = weeks[weeks.length - 2]
  const minutes = cur.force + cur.course + cur.cardio + cur.autre
  const strains = lastDays(today, 7).map((d) => data.checkinByDay.get(d)?.whoopDayStrain).filter((v): v is number => typeof v === 'number')
  const avgStrain = strains.length ? strains.reduce((a, b) => a + b, 0) / strains.length : null
  const ratio = data.balance.ratio
  const effTone: Tone = ratio > 1.5 ? 'watch' : 'good'
  const effTitle = ratio > 1.5 ? 'Tu montes vite en charge' : ratio && ratio < 0.8 ? 'Semaine plutôt calme' : 'Charge dans la zone confortable'
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Headline tone={effTone} title={effTitle} text={`Cette semaine : ${cur.sessions} séance${cur.sessions > 1 ? 's' : ''}${prev ? ` (${prev.sessions} la semaine passée)` : ''}. Ta charge récente est ${ratio ? `${ratio.toFixed(2)} fois ta charge habituelle` : 'encore en construction'}.`} tiles={[
        { label: 'Séances', value: String(cur.sessions), sub: `${prev?.sessions ?? 0} la semaine passée` },
        { label: 'Temps', value: minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes}`, unit: minutes >= 60 ? '' : 'min', sub: 'cette semaine' },
        { label: 'Strain moyen', value: avgStrain === null ? '—' : avgStrain.toFixed(1), unit: '/21', sub: '7 jours · WHOOP', tone: avgStrain === null ? undefined : avgStrain > 16 ? 'watch' : 'info' },
        { label: 'Charge récente', value: ratio ? ratio.toFixed(2) : '—', sub: ratio > 1.5 ? 'montée rapide' : ratio && ratio < 0.8 ? 'phase calme' : 'zone confortable', tone: effTone },
      ]} />
      <Card title="Volume par semaine" subtitle="Minutes d’entraînement par type, 10 semaines">
        <Bars data={weeks.map((w) => ({ day: w.start, force: w.force, course: w.course, cardio: w.cardio, autre: w.autre }))} stacked
          series={[{ key: 'force', color: 'var(--accent)', name: 'Force', unit: 'min' }, { key: 'course', color: '#ff8f45', name: 'Course', unit: 'min' }, { key: 'cardio', color: '#27e0c0', name: 'Cardio / natation', unit: 'min' }, { key: 'autre', color: '#4f5f7a', name: 'Autre', unit: 'min' }]} height={210} />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-mist-500">
          <span>● Force</span><span style={{ color: '#ff8f45' }}>● Course</span><span style={{ color: '#27e0c0' }}>● Cardio / natation</span>
        </div>
      </Card>

      <Card title="Strain WHOOP quotidien" subtitle="Effort total de la journée, 30 jours (0 → 21)">
        <Bars data={strainSeries} series={[{ key: 'strain', color: '#ff8f45', name: 'Strain' }]} yDomain={[0, 21]} height={200} />
      </Card>

      <Card title="Temps par zone de FC" subtitle="28 derniers jours">
        {total < 1 ? <Empty>Les zones viennent des séances importées de WHOOP.</Empty> : (
          <>
            <Donut parts={zones.map((m, i) => ({ name: `Zone ${i + 1}`, value: m, color: zoneColors[i] }))} />
            {pol && <p className="mt-2 text-[0.7rem] text-mist-500">Facile {pol.easy.toFixed(0)} % · moyen {pol.mid.toFixed(0)} % · dur {pol.hard.toFixed(0)} %. Le mieux : beaucoup de facile, un peu de très dur.</p>}
          </>
        )}
      </Card>

      <Card title="Ressenti contre montre" subtitle="Ton RPE (sur 10) et le strain WHOOP, séance par séance">
        {pairs.length < 2 ? <Empty>Note un RPE sur tes séances WHOOP pour comparer.</Empty> : (
          <>
            <Bars data={pairs.map((p) => ({ day: p.day, ressenti: Math.round((p.rpe / 10) * 210) / 10, montre: p.strain }))} series={[{ key: 'ressenti', color: '#9b7bff', name: 'Ressenti (sur 21)' }, { key: 'montre', color: '#ff8f45', name: 'WHOOP' }]} height={170} />
            {gap !== null && <p className="mt-2 text-xs text-mist-300">{Math.abs(gap) < 2 ? 'Ton ressenti colle bien à la montre.' : gap > 0 ? 'Tu ressens plus que ce que mesure ta montre.' : 'Ta montre mesure plus que ce que tu ressens.'}</p>}
          </>
        )}
      </Card>

      <Card title="Intensité ressentie" subtitle="RPE moyen par semaine">
        <SmoothLines data={rpeWeeks} series={[{ key: 'rpe', color: '#9b7bff', name: 'RPE moyen' }]} yDomain={[0, 10]} height={160} />
      </Card>

      <Card title="Séances par semaine" subtitle="Régularité sur 10 semaines">
        <Bars data={weeks.map((w) => ({ day: w.start, s: w.sessions }))} series={[{ key: 's', color: 'var(--accent)', name: 'Séances' }]} height={160} />
      </Card>
    </div>
  )
}

export function ProgressTab() {
  const data = useSoma()
  const { today } = data
  const [exId, setExId] = useState('')
  const cons = useMemo(() => consistency(data.workouts, today, 12, data.settings.weekStartsOn), [data.workouts, today, data.settings.weekStartsOn])
  const streak = streakWeeks(cons, 2)
  const done = cons.slice(0, -1)
  const practiced = useMemo(() => {
    const n = new Map<string, number>()
    for (const w of data.workouts) for (const s of w.sets ?? []) n.set(s.exerciseId, (n.get(s.exerciseId) ?? 0) + 1)
    return data.exercises.filter((e) => n.has(e.id)).sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0))
  }, [data.workouts, data.exercises])
  const active = exId || practiced[0]?.id || ''
  const exSeries = useMemo(() => {
    if (!active) return []
    const rows: { day: string; rm: number | null; reps: number | null }[] = []
    for (let i = 11; i >= 0; i--) {
      const start = addDayKey(today, -7 * (i + 1) + 1), end = addDayKey(today, -7 * i)
      const ws = data.workouts.filter((w) => w.day >= start && w.day <= end)
      const r = exerciseRecords(active, ws, data.loadCtx)
      rows.push({ day: end, rm: r.best1RM ? Math.round(r.best1RM * 10) / 10 : null, reps: r.maxReps || null })
    }
    return rows
  }, [active, data.workouts, data.loadCtx, today])
  const trend = trendOf('Force', exSeries.map((r) => r.rm ?? r.reps))
  const runs = useMemo(() => data.workouts.filter((w) => w.kind === 'course' && w.run?.distanceM && w.run?.durationSec).slice(-14).map((w) => ({
    day: w.day, km: Math.round(w.run!.distanceM! / 100) / 10, pace: Math.round((w.run!.durationSec! / (w.run!.distanceM! / 1000)) / 6) / 10,
  })), [data.workouts])
  const swims = useMemo(() => data.workouts.filter((w) => w.cardio?.modality === 'natation' && w.cardio.distanceM).slice(-14).map((w) => ({ day: w.day, metres: w.cardio!.distanceM! })), [data.workouts])
  const weight = useMemo(() => lastDays(today, 90).map((d) => ({ day: d, kg: data.checkinByDay.get(d)?.weightKg ?? null })), [today, data.checkinByDay])
  const progDone = data.programMarks.length + data.workouts.filter((w) => w.program?.length).length

  const activeGoals = data.goalProgress.filter((p) => p.goal.active)
  const tenus = activeGoals.filter((p) => p.status === 'ok').length
  const sessions4 = done.slice(-4).reduce((a, c) => a + c.sessions, 0)
  const pTone: Tone = !activeGoals.length ? 'info' : tenus / activeGoals.length >= 0.6 ? 'good' : 'info'
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Headline tone={pTone} title={!activeGoals.length ? 'Définis tes objectifs pour suivre ta progression' : `${tenus} objectif${tenus > 1 ? 's' : ''} sur ${activeGoals.length} tenu${tenus > 1 ? 's' : ''} cette période`} text={streak >= 2 ? `${streak} semaines d’affilée avec 2 séances ou plus : la régularité est là.` : 'La régularité fait progresser plus que l’intensité : vise 2 à 3 séances chaque semaine.'} tiles={[
        { label: 'Objectifs tenus', value: `${tenus}/${activeGoals.length}`, tone: pTone },
        { label: 'Série', value: String(streak), unit: 'sem.', sub: '2 séances ou plus', tone: streak >= 3 ? 'good' : undefined },
        { label: '4 dernières semaines', value: String(sessions4), unit: 'séances' },
        { label: 'Programme', value: String(progDone), unit: 'séances', sub: 'cochées au total' },
      ]} />
      <Card title="Où j’en suis de mes objectifs" subtitle="Cette semaine et ce mois, d’après ce que tu as défini" className="lg:col-span-2" action={<button onClick={() => navigate('objectifs')} className="text-xs text-accent">Modifier →</button>}>
        {data.goalProgress.filter((p) => p.goal.active).length === 0 ? (
          <Empty>Aucun objectif pour l’instant : ajoute-les dans l’onglet Objectifs.</Empty>
        ) : (
          <ul className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
            {data.goalProgress.filter((p) => p.goal.active).map((p) => (
              <li key={p.goal.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-mist-100">{p.goal.name}</span>
                  <span className="tnum text-mist-300">{Math.round(p.actual * 10) / 10} / {p.target} {p.label}</span>
                </div>
                <ProgressBar ratio={p.ratio} color={STATUS_COLOR[p.status]} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Régularité" subtitle="Nombre de séances faites chaque semaine">
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-white/4 p-3 hairline"><Stat label="Série" value={streak} unit="sem." hint="2 séances ou plus" color={streak >= 3 ? '#41e08a' : undefined} /></div>
          <div className="rounded-xl bg-white/4 p-3 hairline"><Stat label="Moyenne" value={done.length ? (done.reduce((a, c) => a + c.sessions, 0) / done.length).toFixed(1) : '—'} unit="/ sem." /></div>
          <div className="rounded-xl bg-white/4 p-3 hairline"><Stat label="Programme" value={progDone} unit="séances" /></div>
        </div>
        <Bars data={cons.map((c) => ({ day: c.start, s: c.sessions }))} series={[{ key: 's', color: 'var(--accent)', name: 'Séances' }]} height={150} />
      </Card>

      <Card title="Force" subtitle="Ta meilleure performance de chaque semaine. Le « 1RM » est la charge maximale que tu pourrais soulever une fois, estimée à partir de tes séries." action={practiced.length > 0 ? <div className="w-40"><Select value={active} onChange={setExId} options={practiced.map((e) => ({ value: e.id, label: e.name }))} /></div> : undefined}>
        {practiced.length === 0 ? <Empty>Les exercices que tu notes en séance apparaissent ici.</Empty> : (
          <>
            <SmoothLines data={exSeries} series={[{ key: 'rm', color: '#41e08a', name: '1RM estimé', unit: 'kg' }, { key: 'reps', color: '#9b7bff', name: 'Max reps' }]} height={190} />
            {trend && <p className="mt-2 text-xs text-mist-300">{trend.changePct >= 3 ? `En progrès : ${trend.changePct >= 0 ? '+' : ''}${trend.changePct.toFixed(0)} % depuis le début de la période.` : trend.changePct <= -3 ? 'En léger recul : normal en semaine allégée ou après une coupure.' : 'Stable sur la période.'}</p>}
          </>
        )}
      </Card>

      <Card title="Course" subtitle="Allure (min/km) et distance, dernières sorties">
        {runs.length < 2 ? <Empty>Enregistre quelques sorties pour voir ta progression.</Empty> : (
          <>
            <SmoothLines data={runs} series={[{ key: 'pace', color: '#ff8f45', name: 'Allure', unit: 'min/km' }]} height={150} />
            <Bars data={runs} series={[{ key: 'km', color: '#27e0c0', name: 'Distance', unit: 'km' }]} height={110} />
          </>
        )}
      </Card>

      <Card title="Natation" subtitle="Distance par séance (m)">
        {swims.length < 1 ? <Empty>Ajoute une séance Natation pour la suivre ici.</Empty> : <Bars data={swims} series={[{ key: 'metres', color: '#6bb7ff', name: 'Distance', unit: 'm' }]} height={160} />}
      </Card>

      <Card title="Poids" subtitle="90 jours">
        <SmoothLines data={weight} series={[{ key: 'kg', color: '#8fb4ff', name: 'Poids', unit: 'kg' }]} height={150} />
      </Card>

      <Card title="Mes records" subtitle="Modifiables dans Séances → Records" action={<button onClick={() => navigate('seances')} className="text-xs text-accent">Modifier →</button>}>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {data.settings.references.map((r) => {
            const row = DEFAULT_RECORD_ROWS.find((x) => x.id === r.exerciseId)
            const label = row?.label ?? data.exercises.find((e) => e.id === r.exerciseId)?.name
            if (!label) return null
            const value = r.exerciseId === 'run_5k' && r.holdSec ? `${Math.floor(r.holdSec / 60)}:${String(r.holdSec % 60).padStart(2, '0')}` : r.holdSec ? `${r.holdSec} s` : r.reps ? `${r.reps}${r.loadKg ? ` × ${r.loadKg} kg` : ''}` : '—'
            return (
              <li key={r.exerciseId} className="rounded-xl bg-white/4 px-3 py-2 hairline">
                <div className="truncate text-[0.65rem] tracking-wide text-mist-500 uppercase">{label}</div>
                <div className="text-lg font-semibold tnum text-mist-100">{value}</div>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
