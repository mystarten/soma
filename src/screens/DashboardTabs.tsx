import { Suspense, lazy, useState } from 'react'
import { Segmented } from '../components/ui/primitives'
import { Overview } from './Dashboard'

const Analysis = lazy(() => import('./Analysis'))
const Goals = lazy(() => import('./Goals'))
const Review = lazy(() => import('./Review'))

export type DashTab = 'apercu' | 'analyses' | 'objectifs' | 'revue'

const TABS: { value: DashTab; label: string }[] = [
  { value: 'apercu', label: 'Aperçu' },
  { value: 'analyses', label: 'Analyses' },
  { value: 'objectifs', label: 'Objectifs' },
  { value: 'revue', label: 'Revue' },
]

/** Le tableau de bord : tout au même endroit, en onglets. */
export default function DashboardTabs({ tab: initial = 'apercu' }: { tab?: DashTab }) {
  const [tab, setTab] = useState<DashTab>(initial)
  return (
    <div className="flex flex-col gap-3">
      <div className="scroll-x">
        <Segmented value={tab} onChange={setTab} options={TABS} />
      </div>
      <Suspense fallback={<div className="py-10 text-center text-sm text-mist-700">Chargement…</div>}>
        {tab === 'apercu' && <Overview />}
        {tab === 'analyses' && <Analysis />}
        {tab === 'objectifs' && <Goals />}
        {tab === 'revue' && <Review />}
      </Suspense>
    </div>
  )
}
