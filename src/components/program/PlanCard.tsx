import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { DayKey, Program, Workout } from '../../types'
import { CATEGORY_COLOR, categoryOf } from '../../engine/calendar'
import { buildPlan, planSettings, planWarnings, type PlanEvent } from '../../engine/plan'
import { diffPlan, historyEvents, lockedEntries, planKindOf, storedAuto } from '../../engine/planStore'
import { addDayKey, parseDay } from '../../engine/time'
import { applyPlan } from '../../db/planActions'
import { Button, Card, Segmented, Sheet } from '../ui/primitives'

const fmtDay = (d: DayKey) => format(parseDay(d), 'EEE d MMM', { locale: fr })

/** Le plan des prochains jours : proposé par l'algorithme, enregistré dans le journal comme séances « prévues ». */
export default function PlanCard({ program }: { program: Program }) {
  const data = useSoma()
  const today = data.today
  const [days, setDays] = useState<14 | 28>(14)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const settings = useMemo(() => planSettings(data.settings, program), [data.settings, program])
  const history = useMemo(() => historyEvents(data.workouts), [data.workouts])
  const locked = useMemo(() => lockedEntries(data.workouts, today), [data.workouts, today])
  const plan = useMemo(() => buildPlan({ program, today, days, override: data.settings.programStart, settings, history, locked }), [program, today, days, data.settings.programStart, settings, history, locked])
  const last = addDayKey(today, days - 1) < plan.end ? addDayKey(today, days - 1) : plan.end
  const diff = useMemo(() => diffPlan(storedAuto(data.workouts), plan.entries, today, last), [data.workouts, plan.entries, today, last])

  /* Tout ce qui est enregistré dans le plan (proposé ou posé à la main), jour par jour. */
  const planned = useMemo(() => {
    const m = new Map<DayKey, Workout[]>()
    for (const w of data.workouts) if (w.planned && !w.deleted && w.plan?.status !== 'sautee' && w.day >= today && w.day <= last) m.set(w.day, [...(m.get(w.day) ?? []), w])
    return m
  }, [data.workouts, today, last])
  const doneToday = data.workouts.filter((w) => !w.planned && !w.deleted && !w.backfill && w.day === today)
  const warnings = useMemo(() => {
    const ev: PlanEvent[] = [...history]
    for (const ws of planned.values()) for (const w of ws) { const k = planKindOf(w); if (k) ev.push({ day: w.day, kind: k, code: w.program?.[0]?.code }) }
    const out = new Map<DayKey, { hard: boolean; text: string }[]>()
    for (const w of planWarnings(ev, addDayKey(today, -8), last)) if (w.day >= today) out.set(w.day, [...(out.get(w.day) ?? []), w])
    return out
  }, [history, planned, today, last])

  const hasPlan = storedAuto(data.workouts).some((w) => w.day >= today && w.day <= last)
  const recovery = data.checkinByDay.get(today)?.recovery
  const dayList = Array.from({ length: Math.max(0, Math.round((parseDay(last).getTime() - parseDay(today).getTime()) / 86_400_000) + 1) }, (_, i) => addDayKey(today, i))

  return (
    <Card title="Mon plan" subtitle="Les prochaines séances, proposées d’après ton ordre et tes règles de repos. Tu peux tout déplacer.">
      <div className="mt-3 flex items-center justify-between gap-3">
        <Segmented value={String(days)} onChange={(v) => setDays(v === '28' ? 28 : 14)} options={[{ value: '14', label: '14 jours' }, { value: '28', label: '4 semaines' }]} size="sm" />
        <Button variant={hasPlan && diff.changes.length === 0 ? 'soft' : 'primary'} onClick={() => setPreview(true)} disabled={!diff.changes.length}>
          {hasPlan ? (diff.changes.length ? `Mettre à jour (${diff.changes.length})` : 'À jour ✓') : 'Créer mon plan'}
        </Button>
      </div>

      {recovery !== undefined && recovery < 50 && (planned.get(today)?.length ?? 0) > 0 && (
        <p role="status" className="mt-3 rounded-xl bg-[#ffc24b]/12 px-3 py-2.5 text-sm text-[#ffd98a]">
          Récupération WHOOP du jour : {Math.round(recovery)} %. Tu peux alléger la séance d’aujourd’hui ou la décaler. Rien n’est changé automatiquement.
        </p>
      )}

      <ul className="mt-3 divide-y divide-white/6">
        {dayList.map((d) => {
          const ws = (planned.get(d) ?? []).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
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
                  {ws.length === 0 && done.length === 0 && <p className="text-sm text-mist-700">Repos</p>}
                  {ws.map((w) => (
                    <div key={w.id}>
                      <p className="flex items-center gap-2 text-[0.95rem] text-mist-100">
                        <i className="block h-2 w-2 shrink-0 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${CATEGORY_COLOR[categoryOf(w)]}` }} />
                        <span className="truncate">{w.title}</span>
                        <span className="shrink-0 text-xs text-mist-500">{w.durationMin} min</span>
                        {(!w.plan?.auto || w.plan.locked) && <span className="shrink-0 text-xs" title="Épinglée : l’algorithme n’y touche pas" aria-label="épinglée">📌</span>}
                      </p>
                      <p className="pl-4 text-xs text-mist-500">{w.plan?.reason ?? 'Posée par toi'}</p>
                    </div>
                  ))}
                  {ww.map((x, i) => (
                    <p key={i} className={`pl-4 text-xs ${x.hard ? 'text-[#ff8f8f]' : 'text-[#ffd98a]'}`}>⚠ {x.text}</p>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {plan.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-mist-500">{plan.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
      <p className="mt-3 text-[0.68rem] text-mist-700">Le plan s’arrête à la fin du programme ({fmtDay(plan.end)}). Les séances non faites ne sont jamais rattrapées avec d’anciennes charges : la semaine du programme suit la date.</p>

      {preview && (
        <Sheet
          open
          onClose={() => setPreview(false)}
          title={hasPlan ? 'Mettre à jour le plan' : 'Créer mon plan'}
          footer={
            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await applyPlan(diff, data.workouts, today)
                  setBusy(false)
                  setPreview(false)
                }}
              >
                Appliquer
              </Button>
              <Button onClick={() => setPreview(false)}>Annuler</Button>
            </div>
          }
        >
          <div className="space-y-3 pb-2">
            <p className="text-sm text-mist-300">
              {hasPlan ? `Ces ${diff.changes.length} changements seront appliqués.` : `${diff.changes.length} séances seront placées sur les ${days} prochains jours.`} Tes séances posées à la main et épinglées ne bougent pas.
            </p>
            <ul className="divide-y divide-white/6">
              {diff.changes.map((c, i) => (
                <li key={i} className="py-2.5 text-sm text-mist-100">
                  <b className="text-accent">{c.label}</b>{' '}
                  {c.type === 'move' ? `${fmtDay(c.from!)} → ${fmtDay(c.to!)}` : c.type === 'add' ? `ajoutée le ${fmtDay(c.to!)}` : `retirée (prévue le ${fmtDay(c.from!)})`}
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      )}
    </Card>
  )
}
