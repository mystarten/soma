import { Suspense, lazy, useEffect } from 'react'
import StorageGuard from './components/StorageGuard'
import ErrorBoundary, { autoReloadOnce } from './components/ErrorBoundary'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { BottomNav, SideRail } from './components/Nav'
import Main from './screens/Main'
import { navigate, useRoute } from './lib/router'
import { useSoma } from './hooks/useSoma'
import { SYNC_CONFIGURED } from './sync/supabase'

const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))

const TITLES: Record<string, string> = {
  accueil: 'Mon programme',
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

  /* Les anciens écrans n'existent plus : tout renvoie à la page principale. */
  useEffect(() => {
    if (route !== 'accueil' && route !== 'reglages') navigate('accueil')
  }, [route])

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

          <StorageGuard />
          <ErrorBoundary resetKey={route}>
          <Suspense
            fallback={
              <div className="py-16 text-center text-sm text-mist-700">Chargement…</div>
            }
          >
            {route === 'accueil' && <Main />}
            {route === 'reglages' && <SettingsScreen param={param} />}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <BottomNav current={route} />
    </div>
  )
}
