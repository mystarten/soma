import { useEffect, useId, useRef, useState } from 'react'

/** Anneau animé façon WHOOP. */
export function Ring({
  value,
  max = 100,
  size = 112,
  thickness = 9,
  color = 'var(--accent)',
  label,
  display,
  unit,
  sublabel,
  delay = 0,
  gradient,
}: {
  value: number
  max?: number
  size?: number
  thickness?: number
  color?: string
  label?: string
  display?: string
  unit?: string
  sublabel?: string
  delay?: number
  /** Dégradé le long de l'arc : [début, fin]. */
  gradient?: [string, string]
}) {
  const gid = useId().replace(/:/g, '')
  const [shown, setShown] = useState(0)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced.current) {
      setShown(value)
      return
    }
    const t = window.setTimeout(() => setShown(value), 60 + delay)
    return () => window.clearTimeout(t)
  }, [value, delay])

  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const ratio = Math.max(0, Math.min(1, shown / max))

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {gradient && (
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={gradient[0]} />
                <stop offset="100%" stopColor={gradient[1]} />
              </linearGradient>
            </defs>
          )}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#ffffff12"
            strokeWidth={thickness}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={gradient ? `url(#${gid})` : color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ratio)}
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.22,0.75,0.28,1)',
              filter: `drop-shadow(0 0 4px ${color}66)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-[1.45rem] leading-none font-semibold tnum"
            style={{ color, fontSize: size < 92 ? '1.1rem' : undefined }}
          >
            {display ?? Math.round(value)}
          </span>
          {unit && <span className="mt-0.5 text-[0.6rem] text-mist-500">{unit}</span>}
        </div>
      </div>
      {label && (
        <div className="text-center">
          <div className="text-[0.66rem] font-medium tracking-wider text-mist-300 uppercase">
            {label}
          </div>
          {sublabel && <div className="text-[0.62rem] text-mist-700">{sublabel}</div>}
        </div>
      )}
    </div>
  )
}

/** Petit arc de progression (objectifs, zones). */
export function MiniGauge({
  ratio,
  color,
  size = 42,
  children,
}: {
  ratio: number
  color: string
  size?: number
  children?: React.ReactNode
}) {
  const r = (size - 5) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, ratio))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff12" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[0.6rem] text-mist-300 tnum">
        {children}
      </div>
    </div>
  )
}
