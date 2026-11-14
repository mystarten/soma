import { Suspense, lazy, useEffect, useState } from 'react'
import { whoopHandleReturn } from './integrations/whoop'
import WhoopAuto from './integrations/WhoopAuto'
import ErrorBoundary, { autoReloadOnce } from './components/ErrorBoundary'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { BottomNav, MoreSheetContent, SideRail } from './components/Nav'
import { Sheet } from './components/ui/primitives'
import { useRoute } from './lib/router'
import { useSoma } from './hooks/useSoma'
import { SYNC_CONFIGURED } from './sync/supabase'
import Vie from './screens/Vie'
import BodyScreen from './screens/BodyScreen'
import CheckInScreen from './screens/CheckInScreen'

const Workouts = lazy(() => import('./screens/Workouts'))
const Knowledge = lazy(() => import('./screens/Knowledge'))
const Dashboard = lazy(() => import('./screens/DashboardTabs'))
const WhoopImport = lazy(() => import('./screens/WhoopImport'))
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))

const TITLES: Record<string, string> = {
  accueil: 'Vie',
  sport: 'Sport',
  taches: 'Tâches & échéances',
  savoir: 'Savoir',
  corps: 'Corps',
  checkin: 'Check-in du matin',
  seances: 'Séances',
  calendrier: 'Calendrier',
  objectifs: 'Objectifs',
  analyses: 'Analyses',
  suivi: 'Suivi de fond',
  tableau: 'Tableau de bord',
  revue: 'Revue de la semaine',
  import: 'Import WHOOP',
  reglages: 'Réglages',
}

function SyncBanner() {
  const { syncState } = useSoma()
  if (!SYNC_CONFIGURED) {
    return (
      <div className="px-1 pb-1 text-[0.65rem] text-mist-700">
        Sync désactivée — tout reste sur cet appareil.
      </div>
    )
  }
  if (syncState.kind === 'signed-out')
    return (
      <div className="px-1 pb-1 text-[0.65rem] text-mist-700">
        Sync disponible — connecte-toi dans Réglages.
      </div>
    )
  if (syncState.kind === 'error')
    return (
      <div className="px-1 pb-1 text-[0.65rem] text-[#ffc24b]">
        Sync en attente — {syncState.message}
      </div>
    )
  if (syncState.kind === 'syncing')
    return <div className="px-1 pb-1 text-[0.65rem] text-accent">Synchronisation…</div>
  if (syncState.kind === 'idle')
    return (
      <div className="px-1 pb-1 text-[0.65rem] text-mist-700">
        Synchronisé{syncState.pending > 0 ? ` · ${syncState.pending} en attente` : ''}
      </div>
    )
  return null
}

export default function App() {
  const { route, param } = useRoute()
  const [more, setMore] = useState(false)
  const [whoopMsg, setWhoopMsg] = useState<string | null>(null)

  /* Un fichier de l'ancienne version a disparu (mise à jour publiée) : on se recharge une fois, proprement. */
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      e.preventDefault()
      autoReloadOnce()
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])

  /* Un écran quitté en plein écran ne doit jamais laisser la page bloquée. */
  useEffect(() => {
    document.body.style.overflow = ''
  }, [route])

  /* Retour de la page d'autorisation WHOOP : le code est dans l'adresse. */
  useEffect(() => {
    if (!window.location.search.includes('code=')) return
    void whoopHandleReturn().then((r) => {
      if (r !== 'none') setWhoopMsg(r === 'done' ? 'WHOOP est connecté ✓' : r)
    })
  }, [])

  return (
    <div className="relative z-10 flex min-h-full">
      <SideRail current={route} />
      <main className="min-w-0 flex-1">
        <div
          className="mx-auto w-full max-w-[1680px] px-3 pt-safe sm:px-5"
          style={{ paddingBottom: 'calc(var(--nav-h) + var(--safe-bottom) + 1.5rem)' }}
        >
          <header className="flex items-end justify-between gap-3 pt-2 pb-3">
            <div>
              <h1 className="text-xl font-semibold text-mist-100 sm:text-2xl">{TITLES[route]}</h1>
              <p className="text-xs text-mist-500 capitalize">
                {format(new Date(), 'EEEE d MMMM', { locale: fr })}
              </p>
            </div>
            <div className="text-right">
              <SyncBanner />
            </div>
          </header>

          <WhoopAuto />
          {whoopMsg && (
            <div role="status" className="mb-3 rounded-xl bg-accent/10 px-3 py-2 text-sm text-mist-100 hairline">
              {whoopMsg}{' '}
              <button className="ml-2 text-accent" onClick={() => setWhoopMsg(null)}>OK</button>
            </div>
          )}
          <ErrorBoundary resetKey={route}>
          <Suspense
            fallback={
              <div className="py-16 text-center text-sm text-mist-700">Chargement…</div>
            }
          >
            {(route === 'accueil' || route === 'taches') && <Vie />}
            {route === 'savoir' && <Knowledge />}
            {route === 'corps' && <BodyScreen />}
            {route === 'checkin' && <CheckInScreen day={param} />}
            {route === 'seances' && <Workouts key="seances" focusId={param} />}
            {route === 'calendrier' && <Workouts key="cal" tab="calendrier" calDay={param} />}
            {(route === 'tableau' || route === 'sport' || route === 'suivi') && <Dashboard key="apercu" />}
            {route === 'analyses' && <Dashboard key="analyses" tab="analyses" />}
            {route === 'objectifs' && <Dashboard key="objectifs" tab="objectifs" />}
            {route === 'revue' && <Dashboard key="revue" tab="revue" />}
            {route === 'import' && <WhoopImport />}
            {route === 'reglages' && <SettingsScreen param={param} />}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <BottomNav current={route} onMore={() => setMore(true)} />
      <Sheet open={more} onClose={() => setMore(false)} title="Plus">
        <MoreSheetContent onPick={() => setMore(false)} />
      </Sheet>
    </div>
  )
}
