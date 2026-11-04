import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../hooks/useSoma'
import type { CheckIn, MuscleZone, Soreness } from '../types'
import { MUSCLE_ZONES } from '../types'
import {
  Accordion,
  AccordionItem,
  Badge,
  Button,
  Card,
  Field,
  RangeSlider,
  Stepper,
  TextArea,
  TextInput,
  useToast,
} from '../components/ui/primitives'
import { saveCheckIn } from '../db/repo'
import { addDayKey, parseDay, todayKey } from '../engine/time'
import { ZONE_SHORT, fatigueColor } from '../engine/fatigueConfig'
import { navigate } from '../lib/router'

const recoveryColor = (v: number) => (v >= 67 ? '#41e08a' : v >= 34 ? '#ffc24b' : '#ff5a5a')
const recoveryWord = (v: number) => (v >= 67 ? 'Vert' : v >= 34 ? 'Orange' : 'Rouge')

const MOOD_LABELS = ['', 'Très bas', 'Bas', 'Moyen', 'Bon', 'Excellent']

function timeValue(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isoFromTime(day: string, value: string, previousDay = false) {
  if (!value) return undefined
  const [h, m] = value.split(':').map(Number)
  const base = parseDay(previousDay ? addDayKey(day, -1) : day)
  base.setHours(h, m, 0, 0)
  return base.toISOString()
}

export default function CheckInScreen({ day: dayParam }: { day?: string }) {
  const data = useSoma()
  const day = dayParam ?? todayKey()
  const existing = data.checkinByDay.get(day)
  const toast = useToast()

  const [draft, setDraft] = useState<CheckIn>(() => ({
    id: day,
    day,
    source: 'manual',
    updatedAt: new Date().toISOString(),
    ...existing,
  }))

  useEffect(() => {
    setDraft({
      id: day,
      day,
      source: existing?.source ?? 'manual',
      updatedAt: new Date().toISOString(),
      ...existing,
    })
  }, [day, existing])

  const set = <K extends keyof CheckIn>(key: K, value: CheckIn[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))
  const setSleep = (patch: Partial<NonNullable<CheckIn['sleep']>>) =>
    setDraft((d) => ({ ...d, sleep: { ...d.sleep, ...patch } }))

  const recovery = draft.recovery ?? 60
  const sorenessMap = useMemo(() => {
    const m = new Map<MuscleZone, number>()
    for (const s of draft.soreness ?? []) m.set(s.zone, s.level)
    return m
  }, [draft.soreness])

  const toggleSoreness = (zone: MuscleZone, level: number) => {
    const next: Soreness[] = (draft.soreness ?? []).filter((s) => s.zone !== zone)
    if (level > 0) next.push({ zone, level })
    set('soreness', next)
  }

  const save = async () => {
    await saveCheckIn({ ...draft, source: draft.source === 'whoop' ? 'manual' : draft.source })
    toast.show('Check-in enregistré')
    if (!dayParam) window.setTimeout(() => navigate('accueil'), 500)
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {toast.node}

      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[0.68rem] tracking-wider text-mist-500 uppercase">Jour</div>
            <div className="text-sm text-mist-100 capitalize">
              {format(parseDay(day), 'EEEE d MMMM yyyy', { locale: fr })}
            </div>
          </div>
          {existing && <Badge color="#35e3ff">Déjà renseigné</Badge>}
        </div>
      </Card>

      {/* ── Récupération ── */}
      <Card title="Récupération" subtitle="Comment te sens-tu ce matin ?">
        <div className="mt-3 flex items-center justify-between">
          <span className="text-4xl font-semibold tnum" style={{ color: recoveryColor(recovery) }}>
            {recovery}
            <span className="ml-1 text-base text-mist-500">%</span>
          </span>
          <Badge color={recoveryColor(recovery)}>{recoveryWord(recovery)}</Badge>
        </div>
        <div className="mt-2">
          <RangeSlider
            value={recovery}
            onChange={(v) => set('recovery', v)}
            color={recoveryColor(recovery)}
            trackFill={`linear-gradient(90deg,#ff5a5a,#ffc24b 45%,#41e08a)`}
            label="Récupération en pourcentage"
          />
          <div className="flex justify-between px-1 text-[0.62rem] text-mist-700">
            <span>0</span>
            <span>33</span>
            <span>67</span>
            <span>100</span>
          </div>
        </div>
      </Card>

      {/* ── Sommeil ── */}
      <Card title="Sommeil" subtitle="La nuit qui vient de se terminer">
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Heures de sommeil">
            <Stepper
              value={draft.sleep?.hours ?? 7.5}
              onChange={(v) => setSleep({ hours: v })}
              step={0.25}
              min={0}
              max={14}
              precision={2}
              suffix="h"
            />
          </Field>
          <Field label={`Qualité ressentie · ${draft.sleep?.quality ?? 70} %`}>
            <RangeSlider
              value={draft.sleep?.quality ?? 70}
              onChange={(v) => setSleep({ quality: v })}
              color="#9b7bff"
              label="Qualité du sommeil"
            />
          </Field>
          <Field label="Coucher">
            <TextInput
              type="time"
              value={timeValue(draft.sleep?.bedtime)}
              onChange={(e) => setSleep({ bedtime: isoFromTime(day, e.target.value, true) })}
            />
          </Field>
          <Field label="Lever">
            <TextInput
              type="time"
              value={timeValue(draft.sleep?.wakeTime)}
              onChange={(e) => setSleep({ wakeTime: isoFromTime(day, e.target.value) })}
            />
          </Field>
          <Field label="Réveils nocturnes" optional>
            <Stepper
              value={draft.sleep?.awakenings ?? 0}
              onChange={(v) => setSleep({ awakenings: v })}
              min={0}
              max={20}
            />
          </Field>
        </div>
      </Card>

      {/* ── Facultatif ── */}
      <Card title="Le reste" subtitle="Tout est facultatif, rien n’est obligatoire" padded>
        <div className="mt-1">
          <Accordion>
            <AccordionItem
              id="sante"
              header={<span className="text-sm text-mist-100">Santé & corps</span>}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="FC de repos" optional>
                  <Stepper
                    value={draft.restingHr ?? 50}
                    onChange={(v) => set('restingHr', v)}
                    min={25}
                    max={120}
                    suffix="bpm"
                  />
                </Field>
                <Field label="HRV" optional>
                  <Stepper
                    value={draft.hrv ?? 80}
                    onChange={(v) => set('hrv', v)}
                    min={5}
                    max={250}
                    suffix="ms"
                  />
                </Field>
                <Field label="Poids" optional>
                  <Stepper
                    value={draft.weightKg ?? data.settings.weightKg ?? 70}
                    onChange={(v) => set('weightKg', v)}
                    step={0.1}
                    min={30}
                    max={200}
                    precision={1}
                    suffix="kg"
                  />
                </Field>
                <Field label="Hydratation" optional>
                  <Stepper
                    value={draft.hydrationL ?? 2}
                    onChange={(v) => set('hydrationL', v)}
                    step={0.1}
                    min={0}
                    max={8}
                    precision={1}
                    suffix="L"
                  />
                </Field>
              </div>
            </AccordionItem>

            <AccordionItem
              id="ressenti"
              header={<span className="text-sm text-mist-100">Humeur, énergie, stress</span>}
            >
              <div className="space-y-3">
                {(
                  [
                    ['mood', 'Humeur'],
                    ['energy', 'Énergie'],
                    ['stress', 'Stress'],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={`${label} · ${MOOD_LABELS[draft[key] ?? 3]}`} optional group>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => set(key, n as 1 | 2 | 3 | 4 | 5)}
                          className={`h-11 flex-1 rounded-xl text-sm transition ${
                            draft[key] === n
                              ? 'bg-accent/20 text-accent shadow-[inset_0_0_0_1px_var(--accent-soft)]'
                              : 'bg-white/5 text-mist-500 hairline'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </Field>
                ))}
              </div>
            </AccordionItem>

            <AccordionItem
              id="courbatures"
              header={<span className="text-sm text-mist-100">Courbatures par zone</span>}
            >
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {MUSCLE_ZONES.map((z) => {
                  const level = sorenessMap.get(z) ?? 0
                  return (
                    <div key={z} className="rounded-xl bg-white/4 p-2 hairline">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="truncate text-[0.68rem] text-mist-300">
                          {ZONE_SHORT[z]}
                        </span>
                        <span
                          className="text-[0.68rem] tnum"
                          style={{ color: level ? fatigueColor(level * 10) : 'var(--color-mist-700)' }}
                        >
                          {level}
                        </span>
                      </div>
                      <RangeSlider
                        value={level}
                        onChange={(v) => toggleSoreness(z, v)}
                        min={0}
                        max={10}
                        color={level ? fatigueColor(level * 10) : '#4f5f7a'}
                        label={`Courbature ${ZONE_SHORT[z]}`}
                      />
                    </div>
                  )
                })}
              </div>
            </AccordionItem>

            {data.metrics.length > 0 && (
              <AccordionItem
                id="perso"
                header={<span className="text-sm text-mist-100">Mes métriques</span>}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.metrics.map((m) => (
                    <Field key={m.id} label={`${m.name}${m.unit ? ` (${m.unit})` : ''}`} optional>
                      <Stepper
                        value={draft.custom?.[m.id] ?? m.min}
                        onChange={(v) =>
                          setDraft((d) => ({ ...d, custom: { ...d.custom, [m.id]: v } }))
                        }
                        min={m.min}
                        max={m.max}
                        step={m.max - m.min > 20 ? 1 : 0.5}
                        precision={m.max - m.min > 20 ? 0 : 1}
                      />
                    </Field>
                  ))}
                </div>
              </AccordionItem>
            )}

            <AccordionItem id="notes" header={<span className="text-sm text-mist-100">Notes</span>}>
              <TextArea
                value={draft.notes ?? ''}
                onChange={(e) => set('notes', (e.target as HTMLTextAreaElement).value)}
                placeholder="Une phrase sur ta journée, ton ressenti, un détail à retenir…"
              />
            </AccordionItem>
          </Accordion>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button variant="primary" full onClick={save}>
          Enregistrer
        </Button>
        <Button variant="ghost" onClick={() => navigate('accueil')}>
          Passer ce jour
        </Button>
      </div>
      <p className="px-2 pb-2 text-center text-[0.68rem] text-mist-700">
        Sauter un jour n’a aucune conséquence. L’app ne regarde que les tendances qui durent.
      </p>
    </div>
  )
}
