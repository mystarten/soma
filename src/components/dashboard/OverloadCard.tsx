import { useSoma } from '../../hooks/useSoma'
import { Card, ProgressBar, Stepper } from '../ui/primitives'
import { SmoothLines } from '../charts/charts'
import { saveSettings } from '../../db/repo'
import { addDayKey } from '../../engine/time'
import { goodTimeForTest, type OverloadLevel } from '../../engine/overload'
import { recoveryProfile } from '../../engine/performance'
import { useRotation } from '../program/useRotation'
import { navigate } from '../../lib/router'
import { useOverload } from './useOverload'

export const LEVEL_COLOR: Record<OverloadLevel, string> = { ok: '#41e08a', watch: '#ffc24b', deload: '#ff8f45' }
const LEVEL_TITLE: Record<OverloadLevel, string> = { ok: 'Charge saine', watch: 'À surveiller', deload: 'Décharge conseillée' }

/** Jauge en demi-cercle avec le repère du seuil. */
function Gauge({ value, threshold, color }: { value: number | null; threshold: number; color: string }) {
  const R = 78
  const cx = 100
  const cy = 98
  const arc = (from: number, to: number) => {
    const a = (t: number) => Math.PI * (1 - t / 100)
    const p = (t: number) => [cx + R * Math.cos(a(t)), cy - R * Math.sin(a(t))]
    const [x1, y1] = p(from)
    const [x2, y2] = p(to)
    return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 50 ? 1 : 0} 1 ${x2} ${y2}`
  }
  const tick = (t: number, len: number) => {
    const a = Math.PI * (1 - t / 100)
    return { x1: cx + (R - len) * Math.cos(a), y1: cy - (R - len) * Math.sin(a), x2: cx + (R + len) * Math.cos(a), y2: cy - (R + len) * Math.sin(a) }
  }
  const tk = tick(threshold, 9)
  return (
    <svg viewBox="0 0 200 118" className="w-full max-w-[16rem]" role="img" aria-label={value === null ? 'Charge de fond : pas assez de données' : `Charge de fond : ${value} %`}>
      <path d={arc(0, 100)} fill="none" stroke="#ffffff12" strokeWidth="14" strokeLinecap="round" />
      {value !== null && value > 0 && <path d={arc(0, Math.max(1, value))} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />}
      <line {...tk} stroke="#ffffffaa" strokeWidth="2" />
      <text x={cx} y={cy - 18} textAnchor="middle" fontSize="38" fontWeight="600" fill={value === null ? '#5a6c86' : color}>{value === null ? '—' : value}</text>
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="11" fill="#8a9bb8">% de charge de fond</text>
    </svg>
  )
}

const verdict = (s: number | null) => (s === null ? 'pas de données' : s < 20 ? 'très bien' : s < 40 ? 'bien' : s < 60 ? 'à surveiller' : 'élevé')
const barColor = (s: number | null) => (s === null ? '#3b4a63' : s >= 60 ? '#ff8f45' : s >= 35 ? '#ffc24b' : '#41e08a')

/** Charge de fond : la fatigue accumulée sur plusieurs semaines, et quand faire une décharge. */
export default function OverloadCard() {
  const data = useSoma()
  const o = useOverload()
  const { rotation } = useRotation()
  const { now, threshold } = o
  const color = now.score === null ? '#5a6c86' : LEVEL_COLOR[now.level]
  const rec7 = recoveryProfile(data.checkinByDay, data.today).find((p) => p.label === 'Récupération')?.now ?? null
  const tests = rotation.flatMap((r) => r.available.filter((i) => i.week?.test).map((i) => `${i.code} (S${i.nextWeek})`))
  const testNow = now.level !== 'deload' && (tests.length > 0 || goodTimeForTest(now, rec7))
  const startDeload = () => void saveSettings({ deloadUntil: addDayKey(data.today, 6) })
  const stopDeload = () => void saveSettings({ deloadUntil: undefined })
  const fmt = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')

  return (
    <Card title="Charge de fond" subtitle="La fatigue accumulée sur plusieurs semaines (sommeil, récupération, efforts, performances), pas ta forme de ce matin">
      <div className="mt-3 grid items-center gap-4 md:grid-cols-[16rem_1fr]">
        <div className="mx-auto w-full max-w-[16rem]">
          <Gauge value={now.score} threshold={threshold} color={color} />
          <p className="-mt-1 text-center text-sm font-medium" style={{ color }}>{now.score === null ? 'Pas encore assez de données' : LEVEL_TITLE[now.level]}</p>
        </div>

        <div>
          {now.score === null ? (
            <p className="text-sm text-mist-300">Il faut quelques jours de WHOOP et de séances pour calculer ta charge de fond.</p>
          ) : (
            <>
              <p className="text-sm text-mist-100">
                {now.level === 'deload'
                  ? `Tu as dépassé ${threshold} % : une semaine de décharge te fera du bien avant de repartir plus fort.`
                  : now.level === 'watch'
                    ? 'La fatigue s’accumule. Surveille ton sommeil et garde un jour de repos de plus cette semaine.'
                    : 'Ton corps encaisse bien la charge actuelle. Tu peux continuer sur ce rythme.'}
              </p>
              {now.drivers.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-mist-300">
                  {now.drivers.map((d) => (
                    <li key={d} className="flex gap-2"><span style={{ color }} aria-hidden>●</span>{d}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          {o.deloadActive ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#ffc24b]/10 px-3 py-2.5 text-xs hairline">
              <span className="text-mist-300"><b className="text-[#ffc24b]">Semaine de décharge en cours</b> jusqu’au {fmt(o.deloadUntil)} : un tiers de séries en moins, même charge, aucune série à l’échec.</span>
              <span className="flex gap-2">
                <button onClick={() => navigate('seances')} className="rounded-lg bg-white/8 px-2.5 py-1.5 text-mist-100">Voir le programme</button>
                <button onClick={stopDeload} className="rounded-lg px-2.5 py-1.5 text-mist-500">Arrêter</button>
              </span>
            </div>
          ) : (
            now.score !== null && now.level !== 'ok' && (
              <div className="mt-3 rounded-xl bg-white/5 px-3 py-2.5 text-xs hairline">
                <p className="text-mist-300">
                  <b className="text-mist-100">Semaine de décharge :</b> tu gardes tes séances mais avec un tiers de séries en moins, à la même charge, sans aller à l’échec. Priorité au sommeil, à la marche et à la mobilité.
                </p>
                <button onClick={startDeload} className="mt-2 rounded-lg bg-accent px-3 py-1.5 font-medium text-ink-950">Lancer 7 jours de décharge</button>
              </div>
            )
          )}

          {testNow && (
            <div className="mt-3 rounded-xl bg-[#6fa8ff]/10 px-3 py-2.5 text-xs hairline">
              <b className="text-[#6fa8ff]">Test de records conseillé</b>
              <span className="text-mist-300"> · {tests.length ? `ton programme prévoit une semaine de test (${tests.slice(0, 3).join(', ')}) et tu es en forme pour la faire.` : 'tu es frais et peu chargé : bon moment pour retester un record.'}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs text-mist-300">Évolution sur 4 semaines <span className="text-mist-500">· seuil de décharge à {threshold} %</span></p>
        <SmoothLines data={o.series.map((s) => ({ day: s.day, charge: s.score }))} series={[{ key: 'charge', color, name: 'Charge de fond', unit: '%' }]} yDomain={[0, 100]} reference={threshold} height={150} />
      </div>

      <div className="mt-4 border-t border-white/6 pt-3">
        <p className="text-xs font-medium text-mist-300">Ce qui compose ce chiffre</p>
        <p className="mb-2 text-[0.68rem] text-mist-500">Chaque barre mesure la <b>fatigue</b> de ce signal : <b>plus c’est bas, mieux c’est</b>. 0 % = aucun signe de fatigue.</p>
        <ul className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
          {now.components.map((c) => (
            <li key={c.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="text-mist-100">{c.label}</span>
                <span className="tnum" style={{ color: barColor(c.score) }}>{verdict(c.score)}{c.score === null ? '' : ` · ${Math.round(c.score)} %`}</span>
              </div>
              <ProgressBar ratio={(c.score ?? 0) / 100} color={barColor(c.score)} />
              <p className="mt-0.5 text-[0.66rem] text-mist-500">{c.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/6 pt-3">
        <div>
          <div className="text-xs font-medium text-mist-300">Alerte de décharge à partir de</div>
          <div className="text-[0.66rem] text-mist-500">Plus bas = plus prudent. Calculé chaque jour avec tes données WHOOP et tes séances.</div>
        </div>
        <div className="w-36"><Stepper value={threshold} onChange={(v) => void saveSettings({ deloadAt: v })} min={50} max={95} step={5} suffix="%" /></div>
      </div>
    </Card>
  )
}
