import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { DayKey, Program, Workout } from '../../types'
import { CATEGORY_COLOR, categoryOf } from '../../engine/calendar'
import { planWarnings, type PlanEntry, type PlanEvent } from '../../engine/plan'
import { entryToPlaced, historyEvents, planKindOf, suggestions } from '../../engine/planStore'
import { addDayKey, parseDay } from '../../engine/time'
import { uid } from '../../db/db'
import { Button, Card, Segmented, useToast } from '../ui/primitives'
import { saveSettings, saveWorkout } from '../../db/repo'
import { usePlanCtx } from './usePlanCtx'
import { PlanBlockSheet, PlanMoveSheet } from './PlanMoveSheet'

const fmtDay = (d: DayKey) => format(parseDay(d), 'EEE d MMM', { locale: fr })

/**
 * Mon plan : les séances que TU as placées dans les prochains jours, avec les avertissements de repos.
 * L'algorithme ne place jamais rien tout seul : il propose des suggestions (masquées par défaut) que tu ajoutes si tu veux.
 */
export default function PlanCard(_props: { program: Program }) {
  const data = useSoma()
  const today = data.today
  const [days, setDays] = useState<14 | 28>(14)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const toast = useToast()
  const [moving, setMoving] = useState<Workout | null>(null)
  const [blocking, setBlocking] = useState<DayKey | null>(null)
  const ctx = usePlanCtx(days)
  const history = useMemo(() => historyEvents(data.workouts), [data.workouts])
  const sugg = useMemo(() => (ctx && showSuggestions ? suggestions(ctx) : null), [ctx, showSuggestions])
  const end = sugg?.end
  const last = addDayKey(today, days - 1)
  const blocked = (data.settings.planBlocked ?? []).filter((d) => d >= today)

  const planned = useMemo(() => {
    const m = new Map<DayKey, Workout[]>()
    for (const w of data.workouts) if (w.planned && !w.deleted && w.plan?.status !== 'sautee' && w.day >= today && w.day <= last) m.set(w.day, [...(m.get(w.day) ?? []), w])
    return m
  }, [data.workouts, today, last])
  const byDaySugg = useMemo(() => {
    const m = new Map<DayKey, PlanEntry[]>()
    for (const e of sugg?.entries ?? []) m.set(e.day, [...(m.get(e.day) ?? []), e])
    return m
  }, [sugg])
  const doneToday = data.workouts.filter((w) => !w.planned && !w.deleted && !w.backfill && w.day === today)
  const warnings = useMemo(() => {
    const ev: PlanEvent[] = [...history]
    for (const ws of planned.values()) for (const w of ws) { const k = planKindOf(w); if (k) ev.push({ day: w.day, kind: k, code: w.program?.[0]?.code }) }
    const out = new Map<DayKey, { hard: boolean; text: string }[]>()
    for (const w of planWarnings(ev, addDayKey(today, -8), last)) if (w.day >= today) out.set(w.day, [...(out.get(w.day) ?? []), w])
    return out
  }, [history, planned, today, last])

  const recovery = data.checkinByDay.get(today)?.recovery
  const dayList = Array.from({ length: days }, (_, i) => addDayKey(today, i))
  const add = async (e: PlanEntry) => {
    await saveWorkout(entryToPlaced(e, uid('w'), new Date().toISOString()))
    toast.show(`${e.code ?? e.title} ajoutée au ${fmtDay(e.day)}`)
  }

  return (
    <Card title="Mon plan" subtitle="Ce que tu as placé dans les prochains jours. Rien n’est ajouté sans toi.">
      <div className="mt-3 flex items-center justify-between gap-3">
        <Segmented value={String(days)} onChange={(v) => setDays(v === '28' ? 28 : 14)} options={[{ value: '14', label: '14 jours' }, { value: '28', label: '4 semaines' }]} size="sm" />
        <Button variant={showSuggestions ? 'soft' : 'primary'} onClick={() => setShowSuggestions((v) => !v)}>{showSuggestions ? 'Masquer les suggestions' : 'Voir des suggestions'}</Button>
      </div>

      {recovery !== undefined && recovery < 50 && (planned.get(today)?.length ?? 0) > 0 && (
        <p role="status" className="mt-3 rounded-xl bg-[#ffc24b]/12 px-3 py-2.5 text-sm text-[#ffd98a]">
          Récupération WHOOP du jour : {Math.round(recovery)} %. Tu peux alléger la séance d’aujourd’hui ou la décaler. Rien n’est changé automatiquement.
        </p>
      )}

      <ul className="mt-3 divide-y divide-white/6">
        {dayList.map((d) => {
          const ws = (planned.get(d) ?? []).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
          const ss = byDaySugg.get(d) ?? []
          const ww = warnings.get(d) ?? []
          const done = d === today ? doneToday : []
          return (
            <li key={d} className="py-2.5">
              <div className="flex items-baseline gap-3">
                <span className={`w-[4.6rem] shrink-0 text-xs capitalize tnum ${d === today ? 'font-semibold text-accent' : 'text-mist-500'}`}>{d === today ? 'Aujourd’hui' : fmtDay(d)}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {done.map((w) => (
                    <p key={w.id} className="flex items-center gap-2 text-sm text-mist-300">
                      <i className="block h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[categoryOf(w)] }} />
                      <span className="truncate">{w.title} · faite ✓</span>
                    </p>
                  ))}
                  {blocked.includes(d) && (
                    <p className="flex items-center justify-between gap-2 text-sm text-[#ffd98a]">
                      <span>🚫 Indisponible</span>
                      <button className="min-h-11 rounded-lg bg-white/6 px-3 text-xs text-mist-100" onClick={() => void saveSettings({ planBlocked: blocked.filter((x) => x !== d) })}>Rétablir</button>
                    </p>
                  )}
                  {ws.length === 0 && ss.length === 0 && done.length === 0 && !blocked.includes(d) && <p className="text-sm text-mist-700">Rien de prévu</p>}
                  {ws.map((w) => (
                    <div key={w.id}>
                      <p className="flex items-center gap-2 text-[0.95rem] text-mist-100">
                        <i className="block h-2 w-2 shrink-0 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${CATEGORY_COLOR[categoryOf(w)]}` }} />
                        <span className="truncate">{w.title}</span>
                        <span className="shrink-0 text-xs text-mist-500">{w.durationMin} min</span>
                      </p>
                      {w.plan?.status === 'decalee' && w.plan.originalDay && <p className="pl-4 text-xs text-mist-500">Décalée (était le {fmtDay(w.plan.originalDay)})</p>}
                      <button className="ml-4 mt-1 min-h-11 rounded-lg bg-white/6 px-3.5 text-xs font-medium text-mist-100 active:scale-95" aria-label={`Déplacer ${w.title}`} onClick={() => setMoving(w)}>Déplacer</button>
                    </div>
                  ))}
                  {ss.map((e) => (
                    <div key={e.id} className="rounded-xl border border-dashed border-white/15 px-3 py-2">
                      <p className="flex items-center gap-2 text-sm text-mist-300">
                        <i className="block h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.kind === 'street' && !e.code ? 'street' : e.kind] }} />
                        <span className="truncate">Suggestion : {e.code ? `${e.code} · S${e.week}` : e.title}</span>
                        <span className="shrink-0 text-xs text-mist-500">{e.durationMin} min</span>
                      </p>
                      <p className="text-xs text-mist-500">{e.reason}</p>
                      <Button className="mt-1.5" onClick={() => void add(e)} aria-label={`Ajouter ${e.code ?? e.title} le ${fmtDay(e.day)}`}>+ Ajouter</Button>
                    </div>
                  ))}
                  {!blocked.includes(d) && ctx && (
                    <button className="min-h-11 rounded-lg px-1 text-xs text-mist-500 underline" onClick={() => setBlocking(d)}>Imprévu : jour indisponible</button>
                  )}
                  {ww.map((x, i) => (
                    <p key={i} className={`pl-4 text-xs ${x.hard ? 'text-[#ff8f8f]' : 'text-[#ffd98a]'}`}>⚠ {x.text}</p>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {sugg && sugg.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-mist-500">{sugg.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
      <p className="mt-3 text-[0.68rem] text-mist-700">Pour ajouter une séance toi-même : touche un jour du calendrier. {end ? `Les suggestions s’arrêtent à la fin du programme (${fmtDay(end)}). ` : ''}Une séance non faite n’est jamais rattrapée avec d’anciennes charges : la semaine du programme suit la date.</p>

      {toast.node}
      {moving && ctx && <PlanMoveSheet ctx={ctx} workout={moving} onClose={() => setMoving(null)} onDone={(m) => toast.show(m)} />}
      {blocking && ctx && <PlanBlockSheet ctx={ctx} day={blocking} onClose={() => setBlocking(null)} onDone={(m) => toast.show(m)} />}
    </Card>
  )
}
