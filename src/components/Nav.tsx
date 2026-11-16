import type { ReactNode } from 'react'
import { navigate, type Route } from '../lib/router'

/* Deux écrans seulement : le programme, et les réglages. */

const I = {
  dumbbell: <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.6 7.3l2 1.2M17.4 15.5l2 1.2M4.6 16.7l2-1.2M17.4 8.5l2-1.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
  { route: 'accueil', label: 'Programme', icon: I.dumbbell },
  { route: 'reglages', label: 'Réglages', icon: I.gear },
]

export function BottomNav({ current }: { current: Route }) {
  return (
    <nav className="glass-strong fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around rounded-t-2xl border-t border-white/10 lg:hidden" style={{ paddingBottom: 'var(--safe-bottom)' }} aria-label="Navigation principale">
      {NAV_ITEMS.map((item) => {
        const active = current === item.route
        return (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            aria-current={active ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 transition active:scale-95"
            style={{ color: active ? 'var(--accent)' : 'var(--color-mist-500)' }}
          >
            <Icon>{item.icon}</Icon>
            <span className="text-[0.6rem] font-medium tracking-wide">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function SideRail({ current }: { current: Route }) {
  return (
    <nav className="hidden w-[13rem] shrink-0 flex-col gap-1 border-r border-white/7 p-3 lg:flex" aria-label="Navigation principale">
      <div className="mb-4 px-2 pt-2">
        <div className="text-lg font-semibold tracking-[0.3em] text-mist-100">SOMA</div>
        <div className="text-[0.65rem] tracking-wider text-mist-700 uppercase">Mon programme</div>
      </div>
      {NAV_ITEMS.map((item) => {
        const active = current === item.route
        return (
          <button
            key={item.route}
            onClick={() => navigate(item.route)}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-accent/12 text-accent' : 'text-mist-500 hover:bg-white/5 hover:text-mist-100'}`}
          >
            <Icon>{item.icon}</Icon>
            <span className="font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
