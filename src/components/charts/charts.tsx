import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { parseDay } from '../../engine/time'

/* Thème commun, sobre : peu de grille, pas de légende bruyante. */

const axis = {
  stroke: '#4f5f7a',
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const

function TooltipBox({
  active,
  payload,
  label,
  unit,
  formatter,
}: {
  active?: boolean
  payload?: { value?: number | string; name?: string; color?: string }[]
  label?: string | number
  unit?: string
  formatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-strong rounded-xl px-3 py-2 text-xs">
      {label !== undefined && <div className="mb-1 text-mist-500">{String(label)}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-mist-100">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color ?? 'var(--accent)' }}
          />
          <span className="tnum">
            {typeof p.value === 'number'
              ? formatter
                ? formatter(p.value)
                : Math.round(p.value * 10) / 10
              : p.value}
            {unit ? ` ${unit}` : ''}
          </span>
          {p.name && <span className="text-mist-500">{p.name}</span>}
        </div>
      ))}
    </div>
  )
}

export const shortDay = (d: string) => {
  try {
    return format(parseDay(d), 'd MMM', { locale: fr })
  } catch {
    return d
  }
}

export interface Serie {
  key: string
  color: string
  name: string
  unit?: string
}

/** Courbes lissées (récupération, sommeil…). */
export function SmoothLines({
  data,
  series,
  height = 170,
  yDomain,
  reference,
  xKey = 'day',
}: {
  data: Record<string, number | string | null>[]
  series: Serie[]
  height?: number
  yDomain?: [number, number]
  reference?: number
  xKey?: string
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid stroke="#ffffff0a" vertical={false} />
          <XAxis
            dataKey={xKey}
            {...axis}
            tickFormatter={xKey === 'day' ? shortDay : undefined}
            minTickGap={28}
          />
          <YAxis {...axis} domain={yDomain ?? ["auto", "auto"]} width={38} />
          <Tooltip
            content={<TooltipBox />}
            labelFormatter={xKey === 'day' ? (v) => shortDay(String(v)) : undefined}
          />
          {reference !== undefined && (
            <ReferenceLine y={reference} stroke="#ffffff22" strokeDasharray="4 4" />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive
              animationDuration={800}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Aire dégradée (charge, dette de sommeil…). */
export function GlowArea({
  data,
  dataKey,
  color = 'var(--accent)',
  height = 150,
  unit,
  reference,
  yDomain,
}: {
  data: Record<string, number | string | null>[]
  dataKey: string
  color?: string
  height?: number
  unit?: string
  reference?: number
  yDomain?: [number, number]
}) {
  const id = `grad-${dataKey.replace(/\W/g, '')}`
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#ffffff0a" vertical={false} />
          <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={28} />
          <YAxis {...axis} width={38} domain={yDomain ?? ['auto', 'auto']} />
          <Tooltip content={<TooltipBox unit={unit} />} labelFormatter={(v) => shortDay(String(v))} />
          {reference !== undefined && (
            <ReferenceLine y={reference} stroke="#ffffff22" strokeDasharray="4 4" />
          )}
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            animationDuration={800}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barres (charge par jour, prévu contre réel). */
export function Bars({
  data,
  series,
  height = 150,
  stacked,
  unit,
  colorByValue,
  xKey = 'day',
  hideY,
  yDomain,
}: {
  data: Record<string, number | string | null>[]
  series: Serie[]
  height?: number
  stacked?: boolean
  unit?: string
  colorByValue?: (v: number) => string
  xKey?: string
  hideY?: boolean
  yDomain?: [number, number]
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }} barGap={2}>
          <CartesianGrid stroke="#ffffff0a" vertical={false} />
          <XAxis
            dataKey={xKey}
            {...axis}
            tickFormatter={xKey === 'day' ? shortDay : undefined}
            minTickGap={18}
          />
          {hideY ? (
            <YAxis hide domain={yDomain ?? ['auto', 'auto']} />
          ) : (
            <YAxis {...axis} width={38} domain={yDomain ?? ['auto', 'auto']} />
          )}
          <Tooltip
            content={<TooltipBox unit={unit} />}
            labelFormatter={xKey === 'day' ? (v) => shortDay(String(v)) : undefined}
            cursor={{ fill: '#ffffff08' }}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId={stacked ? 'a' : undefined}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              animationDuration={700}
            >
              {colorByValue
                ? data.map((d, i) => (
                    <Cell key={i} fill={colorByValue(Number(d[s.key] ?? 0))} />
                  ))
                : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Nuage de points pour les corrélations. */
export function Correlation({
  data,
  xKey,
  yKey,
  xLabel,
  yLabel,
  color = 'var(--accent)',
  height = 200,
}: {
  data: Record<string, number>[]
  xKey: string
  yKey: string
  xLabel: string
  yLabel: string
  color?: string
  height?: number
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 10, bottom: 14, left: -20 }}>
          <CartesianGrid stroke="#ffffff0a" />
          <XAxis
            type="number"
            dataKey={xKey}
            name={xLabel}
            {...axis}
            domain={['auto', 'auto']}
            label={{ value: xLabel, position: 'insideBottom', offset: -8, fill: '#4f5f7a', fontSize: 10 }}
          />
          <YAxis
            type="number"
            dataKey={yKey}
            name={yLabel}
            {...axis}
            width={38}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<TooltipBox />} />
          <Scatter data={data} fill={color} fillOpacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Mini graphique inline pour les observations. */
export function Spark({
  data,
  color = 'var(--accent)',
  baseline,
  height = 44,
}: {
  data: { day: string; value: number }[]
  color?: string
  baseline?: number
  height?: number
}) {
  if (!data.length) return null
  const vals = data.map((d) => d.value)
  const min = Math.min(...vals, baseline ?? Infinity)
  const max = Math.max(...vals, baseline ?? -Infinity)
  const span = max - min || 1
  const w = 100
  const pts = data
    .map((d, i) => {
      const x = (i / Math.max(1, data.length - 1)) * w
      const y = height - 4 - ((d.value - min) / span) * (height - 8)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
  const baseY =
    baseline === undefined ? null : height - 4 - ((baseline - min) / span) * (height - 8)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-11 w-full">
      {baseY !== null && (
        <line x1="0" x2={w} y1={baseY} y2={baseY} stroke="#ffffff22" strokeDasharray="3 3" />
      )}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}
