import type { ReactNode } from 'react'
import { navigate, type Route } from '../lib/router'

/* ──────────────────────────────────────────────────────────────────────────
   Mobile d'abord : barre en bas, safe areas iPhone respectées.
   Grand écran : rail latéral avec l'ensemble des écrans.
   ────────────────────────────────────────────────────────────────────────── */

const I = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  body: (
    <>
      <circle cx="12" cy="4.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v6m0 0-3 8m3-8 3 8M6 10l6-1.5 6 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />,
  dumbbell: (
    <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  chart: (
    <path d="M4 19V8m5 11V5m5 14v-7m5 7V9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  ),
  eye: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  upload: (
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.6 7.3l2 1.2M17.4 15.5l2 1.2M4.6 16.7l2-1.2M17.4 8.5l2-1.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  check: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 12.2l2.4 2.4 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h10a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 8.5h5M9 11.5h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  loop: (
    <path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4.2h-4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  pulse: (
    <path d="M3 12h4l2.5-6 4 12 2.5-6H21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  dots: (
    <>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[1.35rem] w-[1.35rem]">
      {children}
    </svg>
  )
}

export const NAV_ITEMS: { route: Route; label: string; icon: ReactNode }[] = [
  { route: 'accueil', label: 'Vie', icon: I.home },
  { route: 'tableau', label: 'Tableau de bord', icon: I.chart },
  { route: 'taches', label: 'Tâches', icon: I.check },
  { route: 'savoir', label: 'Savoir', icon: I.book },
  { route: 'sport', label: 'Sport', icon: I.pulse },
  { route: 'corps', label: 'Corps', icon: I.body },
  { route: 'checkin', label: 'Check-in', icon: I.plus },
  { route: 'seances', label: 'Séances', icon: I.dumbbell },
  { route: 'calendrier', label: 'Calendrier', icon: I.calendar },
  { route: 'objectifs', label: 'Objectifs', icon: I.target },
  { route: 'analyses', label: 'Analyses', icon: I.chart },
  { route: 'revue', label: 'Revue', icon: I.loop },
  { route: 'suivi', label: 'Suivi', icon: I.eye },
  { route: 'import', label: 'Import WHOOP', icon: I.upload },
  { route: 'reglages', label: 'Réglages', icon: I.gear },
]

const MOBILE_ROUTES: Route[] = ['accueil', 'taches', 'checkin', 'seances']

export function BottomNav({
  current,
  onMore,
}: {
  current: Route
  onMore: () => void
}) {
  const items = NAV_ITEMS.filter((i) => MOBILE_ROUTES.includes(i.route))
  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around rounded-t-2xl border-t border-white/10 lg:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Navigation principale"
    >
      {items.map((item) => {
        const active = current === item.route
        const isCheckin = item.route === 'checkin'
        return (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 transition active:scale-95"
            style={{ color: active ? 'var(--accent)' : 'var(--color-mist-500)' }}
          >
            {isCheckin ? (
              <span
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{
                  background: 'var(--accent)',
                  color: '#04070d',
                  boxShadow: '0 0 18px var(--accent-soft)',
                }}
              >
                <Icon>{item.icon}</Icon>
              </span>
            ) : (
              <Icon>{item.icon}</Icon>
            )}
            <span className="text-[0.6rem] font-medium tracking-wide">{item.label}</span>
          </button>
        )
      })}
      <button
        onClick={onMore}
        className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 text-mist-500 transition active:scale-95"
        aria-label="Plus d’écrans"
      >
        <Icon>{I.dots}</Icon>
        <span className="text-[0.6rem] font-medium tracking-wide">Plus</span>
      </button>
    </nav>
  )
}

export function SideRail({ current }: { current: Route }) {
  return (
    <nav
      className="hidden w-[15.5rem] shrink-0 flex-col gap-1 border-r border-white/7 p-3 lg:flex"
      aria-label="Navigation principale"
    >
      <div className="mb-4 px-2 pt-2">
        <div className="text-lg font-semibold tracking-[0.3em] text-mist-100">SOMA</div>
        <div className="text-[0.65rem] tracking-wider text-mist-700 uppercase">
          Sport · Santé · Récupération
        </div>
      </div>
      {NAV_ITEMS.map((item) => {
        const active = current === item.route
        return (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              active ? 'bg-accent/12 text-accent' : 'text-mist-500 hover:bg-white/5 hover:text-mist-100'
            }`}
          >
            <Icon>{item.icon}</Icon>
            <span className="font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function MoreSheetContent({ onPick }: { onPick: () => void }) {
  const rest = NAV_ITEMS.filter((i) => !MOBILE_ROUTES.includes(i.route))
  return (
    <div className="grid grid-cols-2 gap-2 pb-2">
      {rest.map((item) => (
        <button
          key={item.route}
          onClick={() => {
            navigate(item.route)
            onPick()
          }}
          className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 text-sm text-mist-100 hairline"
        >
          <Icon>{item.icon}</Icon>
          {item.label}
        </button>
      ))}
    </div>
  )
}
