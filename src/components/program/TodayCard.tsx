import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import type { DetailBlock, PlanItem, Recommendation, WeekInfo } from '../../engine/todayPlan'
import { simpleAdvice, trainingStreak } from '../../engine/simpleAdvice'
import { fmtDuration, sessionTiming } from '../../engine/runPlan'
import { fmtClock } from '../../engine/runner'
import { Button } from '../ui/primitives'

/** Le détail d'une séance pour la semaine : chaque bloc, ses séries, son repos, sa consigne. */
export function DetailList({ detail }: { detail: DetailBlock[] }) {
  return (
    <ul className="divide-y divide-white/6">
      {detail.map((b, i) => (
        <li key={i} className="py-2.5">
          <p className="text-[0.95rem] leading-snug font-medium text-mist-100">{b.name}</p>
          <p className="mt-0.5 text-sm text-accent tnum">{b.text}</p>
          <p className="mt-0.5 text-xs text-mist-500">
            {b.restSec ? `Repos ${fmtClock(b.restSec)}` : null}
            {b.restSec && b.note ? ' · ' : null}
            {b.note}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Duration({ program, item }: { program: Program; item: PlanItem }) {
  const t = useMemo(() => sessionTiming(program, item.code, item.weekN), [program, item.code, item.weekN])
  if (!t?.sets) return null
  return (
    <span className="text-xs text-mist-300">
      <b className="text-sm font-semibold text-mist-100 tnum">⏱ {fmtDuration(t.totalSec)}</b>
      <span className="text-mist-500"> · repos {fmtDuration(t.restSec)} · {t.sets} séries</span>
    </span>
  )
}

/** « Aujourd'hui » : la semaine du programme, la séance conseillée avec tout son détail, ce qui est fait et ce qui reste. */
export default function TodayCard({
  program,
  week,
  rec,
  onRun,
  onTick,
  onChoose,
}: {
  program: Program
  week: WeekInfo | null
  rec: Recommendation | null
  onRun: (code: string, week: number) => void
  onTick: (code: string, week: number) => void
  onChoose: () => void
}) {
  const data = useSoma()
  const streak = useMemo(() => trainingStreak(data.workouts, data.today), [data.workouts, data.today])
  const restEvery = data.settings.restEvery === 2 ? 2 : 3
  const advice = simpleAdvice({ streak: streak.days, todayDone: streak.todayDone, restEvery })
  const pick = rec?.pick ?? null
  const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`)

  return (
    <section className="rounded-[var(--radius-card)] p-4 hairline" style={{ background: advice.rest ? 'linear-gradient(135deg,#2a1d0e,#0a101c)' : 'linear-gradient(135deg,color-mix(in srgb,var(--accent) 14%,#0a101c),#0a101c)' }}>
      {week ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-xl font-semibold text-mist-100">
            {week.state === 'during' ? `Semaine ${week.n} sur ${week.total}` : week.state === 'before' ? 'Le programme n’a pas commencé' : 'Programme terminé'}
          </h2>
          {week.state === 'during' && <span className="text-sm text-mist-300">· {week.label}</span>}
          {week.light && <span className="rounded-md bg-[#d6b25b]/20 px-2 py-0.5 text-xs font-medium text-[#d6b25b]">décharge</span>}
          {week.test && <span className="rounded-md bg-[#6fa8ff]/20 px-2 py-0.5 text-xs font-medium text-[#6fa8ff]">test</span>}
        </div>
      ) : (
        <h2 className="text-xl font-semibold text-mist-100">Aujourd’hui</h2>
      )}
      {week && week.state !== 'during' && (
        <p className="mt-1 text-sm text-mist-300">{week.state === 'before' ? `Début le ${week.start.slice(8, 10)}/${week.start.slice(5, 7)}. Tu peux quand même lancer une séance.` : 'Tu peux changer la date de départ dans Réglages.'}</p>
      )}
      {!week && <p className="mt-1 text-sm text-mist-300">Indique la date de départ du programme dans Réglages pour voir la semaine en cours.</p>}

      {advice.rest && <p className="mt-2 rounded-lg bg-[#ffc24b]/12 px-3 py-2 text-sm text-[#ffc24b]">{advice.title} · {advice.detail}</p>}

      {rec && pick && (
        <div className="mt-3 rounded-2xl bg-black/25 p-3.5 hairline">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded-lg bg-accent/15 px-2.5 py-1 text-base font-semibold text-accent tnum">{pick.code}</span>
            <div className="min-w-0">
              <p className="text-base leading-snug font-medium text-mist-100">{pick.title}</p>
              <p className="mt-0.5 text-xs text-mist-500">
                Semaine {pick.weekN} de cette séance · {pick.label}
                {pick.light ? ' · décharge' : ''}
                {pick.test ? ' · test' : ''}
              </p>
              <p className="mt-1 text-xs text-mist-300">{rec.reason}</p>
              <p className="mt-1"><Duration program={program} item={pick} /></p>
            </div>
          </div>
          <div className="mt-2">
            <DetailList detail={pick.detail} />
          </div>
          <Button variant="primary" full className="mt-3 !py-4 text-lg" onClick={() => onRun(pick.code, pick.weekN)}>▶ Lancer cette séance</Button>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Button onClick={onChoose}>Autre séance</Button>
            <Button onClick={() => onTick(pick.code, pick.weekN)}>✓ Déjà faite</Button>
          </div>
        </div>
      )}

      {rec && !pick && (
        <div className="mt-3 rounded-2xl bg-black/25 p-3.5 hairline">
          <p className="text-sm text-mist-100">{rec.reason}</p>
          <Button full className="mt-3" onClick={onChoose}>Choisir une séance</Button>
        </div>
      )}
      {!rec && (
        <Button variant="primary" full className="mt-3 !py-4 text-lg" onClick={onChoose}>▶ Lancer une séance</Button>
      )}

      {rec && (
        <div className="mt-3 border-t border-white/8 pt-3">
          <p className="text-[0.68rem] tracking-wide text-mist-500 uppercase">Cette semaine</p>
          <p className="mt-1 text-sm text-mist-100">
            {rec.doneThisWeek.length ? (
              <>
                <b>{rec.doneThisWeek.length} séance{rec.doneThisWeek.length > 1 ? 's' : ''}</b> faite{rec.doneThisWeek.length > 1 ? 's' : ''} · {fmtMin(rec.doneMinutes)}
              </>
            ) : (
              'Aucune séance faite pour l’instant'
            )}
          </p>
          {rec.doneThisWeek.length > 0 && (
            <p className="mt-0.5 text-xs text-mist-500">{rec.doneThisWeek.map((w) => w.title ?? 'Séance').join(' · ')}</p>
          )}
          <p className="mt-1.5 text-sm text-mist-300">
            {rec.remaining.length ? (
              <>
                Reste à faire : {rec.remaining.map((r) => (
                  <span key={r.code} className="mr-1.5 inline-block rounded-md bg-white/7 px-1.5 py-0.5 text-xs text-mist-100 hairline">{r.code}</span>
                ))}
              </>
            ) : (
              'Tout est fait cette semaine.'
            )}
          </p>
        </div>
      )}
    </section>
  )
}
