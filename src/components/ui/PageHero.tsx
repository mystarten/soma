import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  dumbbell: <path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12" />,
  brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1V4a3 3 0 0 1 3 0z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  link: <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />,
  book: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM8 17h11" />,
  database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  sliders: <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  library: <path d="M4 4v16M9 4v16M14 6l5 14M4 20h16" />,
}

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name] ?? PATHS.gear}
    </svg>
  )
}

/** Titre de carte avec une pastille d'icône : repère visuel rapide dans les longues pages. */
export function IconTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent shadow-[inset_0_0_0_1px_var(--accent-soft)]">
        <Icon name={icon} size={17} />
      </span>
      {children}
    </span>
  )
}

/** Bandeau d'en-tête d'une page : icône, titre, phrase d'accroche et chiffres clés. */
export default function PageHero({
  icon,
  title,
  text,
  stats,
  children,
}: {
  icon: string
  title: string
  text?: string
  stats?: { label: string; value: string; unit?: string }[]
  children?: ReactNode
}) {
  return (
    <section
      className="relative mb-4 overflow-hidden rounded-[var(--radius-card)] p-5 hairline"
      style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, #0a101c) 0%, #0a101c 55%, color-mix(in srgb, #9b7bff 12%, #0a101c) 100%)' }}
    >
      <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full opacity-30 blur-3xl" style={{ background: 'var(--accent)' }} aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent shadow-[inset_0_0_0_1px_var(--accent-soft),0_0_24px_-6px_var(--accent)]">
            <Icon name={icon} size={24} />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-semibold text-mist-100">{title}</h2>
            {text && <p className="mt-0.5 text-sm text-mist-300">{text}</p>}
          </div>
        </div>
        {stats && stats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stats.map((s) => (
              <div key={s.label} className="min-w-[5.5rem] rounded-2xl bg-black/25 px-3.5 py-2 hairline">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl leading-none font-semibold tnum text-mist-100">{s.value}</span>
                  {s.unit && <span className="text-xs text-mist-500">{s.unit}</span>}
                </div>
                <div className="mt-1 text-[0.62rem] tracking-wide text-mist-500 uppercase">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  )
}
