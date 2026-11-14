import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import { Bars, SmoothLines } from '../charts/charts'
import { lastDays } from '../../engine/time'
import { dayLoadSeries } from '../../engine/load'
import { recoveryProfile } from '../../engine/performance'
import { navigate } from '../../lib/router'

const fmtH = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`

function Tile({ label, value, hint, good }: { label: string; value: string; hint?: string; good?: boolean | null }) {
  return (
    <div className="rounded-xl bg-white/4 px-3 py-2 hairline">
      <div className="text-[0.65rem] tracking-wide text-mist-500 uppercase">{label}</div>
      <div className="text-lg leading-tight font-semibold tnum" style={{ color: good === undefined || good === null ? undefined : good ? '#41e08a' : '#ffc24b' }}>{value}</div>
      {hint && <div className="text-[0.65rem] text-mist-700">{hint}</div>}
    </div>
  )
}

/** Les données WHOOP qui comptent vraiment, en un coup d'œil. Le détail est dans le Tableau de bord. */
export default function KeyMetrics() {
  const data = useSoma()
  const { today, checkinByDay: by } = data
  const c = by.get(today)
  const profile = useMemo(() => recoveryProfile(by, today), [by, today])
  const vfc = profile.find((p) => p.label === 'VFC')
  const days7 = useMemo(() => lastDays(today, 7), [today])
  const days14 = useMemo(() => lastDays(today, 14), [today])
  const hrvRhr = days14.map((day) => ({ day, vfc: by.get(day)?.hrv ?? null, fc: by.get(day)?.restingHr ?? null }))
  const stages = days7.map((day) => {
    const s = by.get(day)?.sleep
    return { day, profond: s?.deepMin ? Math.round((s.deepMin / 60) * 10) / 10 : null, paradoxal: s?.remMin ? Math.round((s.remMin / 60) * 10) / 10 : null, leger: s?.lightMin ? Math.round((s.lightMin / 60) * 10) / 10 : null }
  })
  const loads = useMemo(() => dayLoadSeries(days14[0], today, data.workouts, data.checkins, data.loadCtx).map((l) => ({ day: l.day, charge: Math.round(l.load * 10) / 10 })), [days14, today, data.workouts, data.checkins, data.loadCtx])
  const hasHrv = hrvRhr.some((r) => r.vfc !== null || r.fc !== null)
  const hasStages = stages.some((s) => s.profond !== null)
  const hasLoad = loads.some((l) => l.charge > 0)

  return (
    <section aria-label="Données clés" className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[0.95rem] font-medium text-mist-100">L’essentiel de ta récupération</h3>
        <button onClick={() => navigate('tableau')} className="text-xs text-accent">Tout en détail →</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="VFC" value={c?.hrv ? `${Math.round(c.hrv)} ms` : '—'} hint={vfc?.deltaPct != null ? `${vfc.deltaPct >= 0 ? '+' : ''}${vfc.deltaPct.toFixed(0)} % vs base` : undefined} good={vfc?.deltaPct == null ? null : vfc.deltaPct >= 0} />
        <Tile label="FC repos" value={c?.restingHr ? `${Math.round(c.restingHr)} bpm` : '—'} />
        <Tile label="Sommeil profond" value={c?.sleep?.deepMin ? fmtH(c.sleep.deepMin) : '—'} />
        <Tile label="Paradoxal" value={c?.sleep?.remMin ? fmtH(c.sleep.remMin) : '—'} />
      </div>
      {hasHrv && (
        <div className="mt-4">
          <p className="mb-1 text-xs text-mist-300">VFC et FC de repos <span className="text-mist-500">· 14 jours</span></p>
          <SmoothLines data={hrvRhr} series={[{ key: 'vfc', color: '#27e0c0', name: 'VFC', unit: 'ms' }, { key: 'fc', color: '#ff8f45', name: 'FC repos', unit: 'bpm' }]} height={120} />
        </div>
      )}
      {hasStages && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-mist-300">Phases de sommeil <span className="text-mist-500">· 7 nuits</span></p>
          <Bars data={stages} stacked series={[{ key: 'profond', color: '#6b4bff', name: 'Profond', unit: 'h' }, { key: 'paradoxal', color: '#27e0c0', name: 'Paradoxal', unit: 'h' }, { key: 'leger', color: '#4f5f7a', name: 'Léger', unit: 'h' }]} height={120} hideY />
        </div>
      )}
      {hasLoad && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-mist-300">Charge d’effort <span className="text-mist-500">· 14 jours</span></p>
          <Bars data={loads} series={[{ key: 'charge', color: '#ff8f45', name: 'Charge', unit: '/ 21' }]} yDomain={[0, 21]} height={110} hideY />
        </div>
      )}
    </section>
  )
}
