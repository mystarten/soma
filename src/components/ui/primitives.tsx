import { createPortal } from 'react-dom'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

/* ── Carte en verre dépoli ────────────────────────────────────────────── */

export function Card({
  children,
  className = '',
  title,
  subtitle,
  action,
  padded = true,
  onClick,
}: {
  children?: ReactNode
  className?: string
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  padded?: boolean
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`glass relative w-full overflow-hidden rounded-[var(--radius-card)] text-left ${
        padded ? 'p-4' : ''
      } ${onClick ? 'transition active:scale-[0.99]' : ''} ${className}`}
    >
      {(title || action) && (
        <div className={`flex items-start justify-between gap-3 ${padded ? '' : 'p-4 pb-0'}`}>
          <div>
            {title && (
              <h3 className="text-[0.95rem] leading-tight font-medium text-mist-100">{title}</h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-mist-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Tag>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between px-1">
      <h2 className="text-[0.7rem] font-semibold tracking-[0.18em] text-mist-500 uppercase">
        {children}
      </h2>
      {action}
    </div>
  )
}

/* ── Boutons ──────────────────────────────────────────────────────────── */

type Variant = 'primary' | 'ghost' | 'soft' | 'danger'

export function Button({
  variant = 'soft',
  className = '',
  children,
  full,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100'
  const styles: Record<Variant, string> = {
    primary: 'text-ink-950 bg-accent glow-accent',
    soft: 'bg-white/6 text-mist-100 hairline hover:bg-white/10',
    ghost: 'text-mist-300 hover:text-mist-100 hover:bg-white/5',
    danger: 'bg-[#ff5a5a1a] text-[#ff8f8f] border border-[#ff5a5a33] hover:bg-[#ff5a5a26]',
  }
  return (
    <button className={`${base} ${styles[variant]} ${full ? 'w-full' : ''} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function IconButton({
  className = '',
  children,
  label,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/6 text-mist-300 transition hairline active:scale-95 hover:text-mist-100 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ── Contrôle segmenté ───────────────────────────────────────────────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 rounded-xl bg-white/5 p-1 hairline ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg transition ${
              size === 'sm' ? 'px-2.5 py-1 text-[0.72rem]' : 'px-3 py-1.5 text-xs'
            } ${
              active
                ? 'bg-accent/18 text-accent shadow-[inset_0_0_0_1px_var(--accent-soft)]'
                : 'text-mist-500 hover:text-mist-300'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Badges & pastilles ──────────────────────────────────────────────── */

export function Badge({
  children,
  color,
  className = '',
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] font-medium ${className}`}
      style={{
        color: color ?? 'var(--color-mist-300)',
        background: color ? `${color}1f` : '#ffffff0d',
        boxShadow: `inset 0 0 0 1px ${color ? `${color}33` : '#ffffff14'}`,
      }}
    >
      {children}
    </span>
  )
}

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color, boxShadow: `0 0 8px ${color}99` }}
    />
  )
}

/* ── Champs ───────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
  optional,
  group,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  optional?: boolean
  /** `true` quand le contenu n'est pas un champ unique (groupe de boutons). */
  group?: boolean
}) {
  const Tag = group ? 'div' : 'label'
  return (
    <Tag className="block" role={group ? 'group' : undefined}>
      <span className="mb-1.5 flex items-baseline gap-2 text-xs font-medium text-mist-300">
        {label}
        {optional && <span className="text-[0.65rem] text-mist-700">facultatif</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.68rem] text-mist-700">{hint}</span>}
    </Tag>
  )
}

export function TextInput({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-100 tnum transition hairline outline-none placeholder:text-mist-700 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] ${className}`}
      {...rest}
    />
  )
}

export function TextArea({
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      className={`w-full resize-y rounded-xl bg-ink-900/70 px-3.5 py-2.5 text-sm text-mist-100 transition hairline outline-none placeholder:text-mist-700 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] ${className}`}
      {...(rest as object)}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-xl bg-ink-900/70 py-2.5 pr-9 pl-3.5 text-sm text-mist-100 transition hairline outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-900">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-mist-500"
      >
        <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </div>
  )
}

/** Stepper gros doigts : − valeur + */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  suffix,
  precision = 0,
}: {
  value: number | undefined
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  precision?: number
}) {
  const v = value ?? 0
  const set = (n: number) => onChange(Math.min(max, Math.max(min, Number(n.toFixed(precision)))))
  return (
    <div className="flex w-full min-w-0 items-center gap-1 rounded-xl bg-ink-900/70 p-1 hairline">
      <button
        type="button"
        aria-label="Diminuer"
        onClick={() => set(v - step)}
        className="h-11 w-11 shrink-0 rounded-lg text-lg text-mist-300 transition active:scale-95 hover:bg-white/6"
      >
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => (e.target.value === '' ? onChange(min) : set(Number(e.target.value)))}
        className="w-0 min-w-0 flex-1 bg-transparent text-center text-base font-medium text-mist-100 tnum outline-none"
      />
      {suffix && <span className="pr-1 text-xs text-mist-500">{suffix}</span>}
      <button
        type="button"
        aria-label="Augmenter"
        onClick={() => set(v + step)}
        className="h-11 w-11 shrink-0 rounded-lg text-lg text-mist-300 transition active:scale-95 hover:bg-white/6"
      >
        +
      </button>
    </div>
  )
}

/** Slider coloré, pensé pour le pouce. */
export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  color = 'var(--accent)',
  trackFill,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  color?: string
  trackFill?: string
  label?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={
        {
          '--thumb': color,
          '--track': `linear-gradient(90deg, ${trackFill ?? color} ${pct}%, #1f3250 ${pct}%)`,
        } as React.CSSProperties
      }
    />
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? 'bg-accent/35' : 'bg-white/8'
      } hairline`}
    >
      <span
        className="absolute top-1 h-5 w-5 rounded-full transition-all"
        style={{
          left: checked ? '1.625rem' : '0.25rem',
          background: checked ? 'var(--accent)' : '#7c8dab',
          boxShadow: checked ? '0 0 12px var(--accent-soft)' : 'none',
        }}
      />
    </button>
  )
}

/* ── Feuille modale (bottom sheet sur mobile, dialogue sur grand écran) ── */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`glass-strong anim-in relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl sm:rounded-3xl ${
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-base font-medium text-mist-100">{title}</h2>
          <IconButton label="Fermer" onClick={onClose}>
            <svg viewBox="0 0 20 20" className="h-4 w-4">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" fill="none" />
            </svg>
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-white/8 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ── Divers ───────────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm text-mist-300">{title}</p>
      {hint && <p className="max-w-xs text-xs text-mist-700">{hint}</p>}
      {action}
    </div>
  )
}

export function Stat({
  label,
  value,
  unit,
  hint,
  color,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  color?: string
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[0.68rem] tracking-wide text-mist-500 uppercase">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className="text-xl leading-none font-semibold tnum"
          style={{ color: color ?? 'var(--color-mist-100)' }}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-mist-500">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 truncate text-[0.68rem] text-mist-700">{hint}</div>}
    </div>
  )
}

export function ProgressBar({
  ratio,
  color = 'var(--accent)',
  height = 8,
}: {
  ratio: number
  color?: string
  height?: number
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-white/7"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}66` }}
      />
    </div>
  )
}

/* ── Accordéon léger ─────────────────────────────────────────────────── */

const AccordionCtx = createContext<{ open: string | null; set: (v: string | null) => void } | null>(
  null,
)

export function Accordion({ children }: { children: ReactNode }) {
  const [open, set] = useState<string | null>(null)
  return <AccordionCtx.Provider value={{ open, set }}>{children}</AccordionCtx.Provider>
}

export function AccordionItem({
  id,
  header,
  children,
}: {
  id: string
  header: ReactNode
  children: ReactNode
}) {
  const ctx = useContext(AccordionCtx)
  const uid = useId()
  const isOpen = ctx?.open === id
  return (
    <div className="border-b border-white/6 last:border-0">
      <button
        aria-expanded={isOpen}
        aria-controls={uid}
        onClick={() => ctx?.set(isOpen ? null : id)}
        className="flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        {header}
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-mist-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {isOpen && (
        <div id={uid} className="pb-3">
          {children}
        </div>
      )}
    </div>
  )
}

/** Petit retour visuel non bloquant. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>(0)
  const show = (m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }
  const node = msg ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-60 flex justify-center px-4">
      <div className="glass-strong anim-in rounded-full px-4 py-2 text-sm text-mist-100">{msg}</div>
    </div>
  ) : null
  return { show, node }
}
