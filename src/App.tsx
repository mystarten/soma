import { Suspense, lazy, useEffect, useState } from 'react'
import { whoopHandleReturn } from './integrations/whoop'
import WhoopAuto from './integrations/WhoopAuto'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { BottomNav, MoreSheetContent, SideRail } from './components/Nav'
import { Sheet } from './components/ui/primitives'
import { useRoute } from './lib/router'
import { useSoma } from './hooks/useSoma'
import { SYNC_CONFIGURED } from './sync/supabase'
import Home from './screens/Home'
import Vie from './screens/Vie'
import BodyScreen from './screens/BodyScreen'
import CheckInScreen from './screens/CheckInScreen'

const Workouts = lazy(() => import('./screens/Workouts'))
const TasksScreen = lazy(() => import('./screens/TasksScreen'))
const Knowledge = lazy(() => import('./screens/Knowledge'))
const CalendarScreen = lazy(() => import('./screens/CalendarScreen'))
const Goals = lazy(() => import('./screens/Goals'))
const Analysis = lazy(() => import('./screens/Analysis'))
const Follow = lazy(() => import('./screens/Follow'))
const Dashboard = lazy(() => import('./screens/Dashboard'))
const Review = lazy(() => import('./screens/Review'))
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
          <Suspense
            fallback={
              <div className="py-16 text-center text-sm text-mist-700">Chargement…</div>
            }
          >
            {route === 'accueil' && <Vie />}
            {route === 'sport' && <Home />}
            {route === 'taches' && <TasksScreen />}
            {route === 'savoir' && <Knowledge />}
            {route === 'corps' && <BodyScreen />}
            {route === 'checkin' && <CheckInScreen day={param} />}
            {route === 'seances' && <Workouts focusId={param} />}
            {route === 'calendrier' && <CalendarScreen day={param} />}
            {route === 'objectifs' && <Goals />}
            {route === 'analyses' && <Analysis />}
            {route === 'suivi' && <Follow />}
            {route === 'tableau' && <Dashboard />}
            {route === 'revue' && <Review />}
            {route === 'import' && <WhoopImport />}
            {route === 'reglages' && <SettingsScreen param={param} />}
          </Suspense>
        </div>
      </main>
      <BottomNav current={route} onMore={() => setMore(true)} />
      <Sheet open={more} onClose={() => setMore(false)} title="Plus">
        <MoreSheetContent onPick={() => setMore(false)} />
      </Sheet>
    </div>
  )
}
