import { Component, type ErrorInfo, type ReactNode } from 'react'

/* Un écran qui plante ne doit jamais laisser une page noire : on affiche le problème et un bouton.
   Cas fréquent : une nouvelle version de l'app vient d'être publiée et l'ancienne gardée en mémoire ne
   retrouve plus un de ses fichiers ; on recharge alors une fois, automatiquement. */

const RELOAD_FLAG = 'soma-chunk-reloaded'

export const isChunkError = (e: unknown): boolean => {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|error loading dynamically/i.test(m)
}

/** Vide l'ancienne version gardée en mémoire puis recharge, une seule fois par session. */
export async function reloadFresh(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((regs ?? []).map((r) => r.unregister()))
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } catch {
    /* sans service worker : un simple rechargement suffit */
  }
  window.location.reload()
}

export function autoReloadOnce(): boolean {
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG)) return false
    window.sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    return false
  }
  void reloadFresh()
  return true
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Écran en erreur :', error, info.componentStack)
    if (isChunkError(error)) autoReloadOnce()
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    /* Changer d'écran repart sur une page saine. */
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const stale = isChunkError(error)
    return (
      <div role="alert" className="glass mx-auto mt-6 max-w-md rounded-[var(--radius-card)] p-5 text-center">
        <h2 className="text-base font-semibold text-mist-100">{stale ? 'Une nouvelle version est disponible' : 'Cet écran a rencontré un problème'}</h2>
        <p className="mt-2 text-sm text-mist-300">
          {stale
            ? 'L’app va se mettre à jour. Si rien ne se passe, touche le bouton.'
            : 'Tes données sont intactes. Recharge la page ; si ça revient, dis-moi ce message :'}
        </p>
        {!stale && <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-left text-[0.7rem] break-words text-mist-500">{error.message}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => void reloadFresh()} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-ink-950">
            Recharger l’app
          </button>
          <button
            onClick={() => {
              window.location.hash = '#/accueil'
              this.setState({ error: null })
            }}
            className="rounded-xl bg-white/8 px-4 py-2 text-sm text-mist-100"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    )
  }
}
