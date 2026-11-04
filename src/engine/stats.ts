/** Statistiques locales — aucune dépendance. */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const round = (v: number, digits = 0) => {
  const f = 10 ** digits
  return Math.round(v * f) / f
}

export function mean(xs: readonly number[]): number {
  if (!xs.length) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) ** 2
  return Math.sqrt(s / (xs.length - 1))
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0
  const a = [...xs].sort((p, q) => p - q)
  const mid = a.length >> 1
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

export function sum(xs: readonly number[]): number {
  let s = 0
  for (const x of xs) s += x
  return s
}

/** Moyenne mobile centrée sur `window` points, tolérante aux trous (null). */
export function movingAverage(
  xs: readonly (number | null | undefined)[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = []
  const half = Math.floor(window / 2)
  for (let i = 0; i < xs.length; i++) {
    const vals: number[] = []
    for (let j = Math.max(0, i - half); j <= Math.min(xs.length - 1, i + half); j++) {
      const v = xs[j]
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
    }
    out.push(vals.length ? mean(vals) : null)
  }
  return out
}

/** Moyenne mobile « arrière » (ne regarde que le passé) — utilisée pour les tendances. */
export function trailingAverage(
  xs: readonly (number | null | undefined)[],
  window: number,
): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < xs.length; i++) {
    const vals: number[] = []
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = xs[j]
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v)
    }
    out.push(vals.length ? mean(vals) : null)
  }
  return out
}

/** Moyenne pondérée exponentielle (lissage des charges). */
export function ewma(xs: readonly number[], alpha: number): number {
  if (!xs.length) return 0
  let acc = xs[0]
  for (let i = 1; i < xs.length; i++) acc = alpha * xs[i] + (1 - alpha) * acc
  return acc
}

export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 4) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/** Régression linéaire simple : renvoie pente par pas d'index. */
export function slope(ys: readonly number[]): number {
  const n = ys.length
  if (n < 2) return 0
  const mx = (n - 1) / 2
  const my = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my)
    den += (i - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

/** Interpolation linéaire entre deux couleurs hex. */
export function lerpColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a)
  const pb = hexToRgb(b)
  const k = clamp(t, 0, 1)
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * k)
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * k)
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * k)
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}
