import { Suspense, lazy, useState } from 'react'
import { Segmented } from '../components/ui/primitives'
import { Overview } from './Dashboard'

const Analysis = lazy(() => import('./Analysis'))
const Recovery = lazy(() => import('./PerfTabs').then((m) => ({ default: m.RecoveryTab })))
const Effort = lazy(() => import('./PerfTabs').then((m) => ({ default: m.EffortTab })))
const Progress = lazy(() => import('./PerfTabs').then((m) => ({ default: m.ProgressTab })))
const Goals = lazy(() => import('./Goals'))
const Review = lazy(() => import('./Review'))

export type DashTab = 'apercu' | 'recuperation' | 'effort' | 'progression' | 'analyses' | 'objectifs' | 'revue'

const TABS: { value: DashTab; label: string }[] = [
  { value: 'apercu', label: 'Aperçu' },
  { value: 'recuperation', label: 'Récupération' },
  { value: 'effort', label: 'Effort' },
  { value: 'progression', label: 'Progression' },
  { value: 'analyses', label: 'Corrélations' },
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
        {tab === 'recuperation' && <Recovery />}
        {tab === 'effort' && <Effort />}
        {tab === 'progression' && <Progress />}
        {tab === 'analyses' && <Analysis />}
        {tab === 'objectifs' && <Goals />}
        {tab === 'revue' && <Review />}
      </Suspense>
    </div>
  )
}
