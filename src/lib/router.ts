import { useEffect, useState } from 'react'

/* Routeur minimal par ancre : compatible GitHub Pages et PWA hors ligne. */

export type Route =
  | 'accueil'
  | 'sport'
  | 'taches'
  | 'savoir'
  | 'corps'
  | 'checkin'
  | 'seances'
  | 'calendrier'
  | 'objectifs'
  | 'analyses'
  | 'suivi'
  | 'tableau'
  | 'revue'
  | 'import'
  | 'reglages'

export const ROUTES: Route[] = [
  'accueil',
  'sport',
  'taches',
  'savoir',
  'corps',
  'checkin',
  'seances',
  'calendrier',
  'objectifs',
  'analyses',
  'suivi',
  'tableau',
  'revue',
  'import',
  'reglages',
]

function parse(): { route: Route; param?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [name, param] = raw.split('/')
  const route = (ROUTES as string[]).includes(name) ? (name as Route) : 'accueil'
  return { route, param: param ? decodeURIComponent(param) : undefined }
}

export function navigate(route: Route, param?: string) {
  window.location.hash = `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`
}

export function useRoute() {
  const [state, setState] = useState(parse)
  useEffect(() => {
    const onHash = () => {
      setState(parse())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.replace('#/accueil')
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return state
}
