import { useEffect, useMemo, useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import type {
  CustomMetric,
  ExerciseDef,
  FatigueConfig,
  MuscleZone,
  Settings,
  WorkoutTemplate,
  ZoneSize,
} from '../types'
import { MUSCLE_ZONES } from '../types'
import {
  Accordion,
  AccordionItem,
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  RangeSlider,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Stepper,
  TextInput,
  Toggle,
  useToast,
} from '../components/ui/primitives'
import {
  checkinsToCsv,
  deleteMetric,
  deleteTemplate,
  exportBackup,
  importBackup,
  saveExercise,
  saveMetric,
  saveSettings,
  saveTemplate,
  wipeData,
  workoutsToCsv,
} from '../db/repo'
import { uid } from '../db/db'
import { generateDemoData, removeDemoData } from '../db/demo'
import { DEFAULT_FATIGUE_CONFIG, ZONE_LABEL, ZONE_SHORT } from '../engine/fatigueConfig'
import { RUN_5K_REFERENCE_ID, STARTING_REFERENCES } from '../db/seed'
import { defaultHrZones } from '../engine/cardio'
import { WORKOUT_KIND_LABEL } from '../engine/muscleMap'
import { fmtClock, todayKey } from '../engine/time'
import {
  SYNC_CONFIGURED,
  SYNC_FROM_BROWSER,
  clearSyncConfig,
  currentSyncConfig,
  parseShared,
  saveSyncConfig,
  shareLink,
  validateSyncConfig,
} from '../sync/supabase'
import schemaSql from '../../supabase/schema.sql?raw'
import { currentEmail, sendMagicLink, signOut, syncNow } from '../sync/syncEngine'
import { ExercisePicker } from './Workouts'

const ACCENTS = ['#35e3ff', '#41e08a', '#9b7bff', '#ffc24b', '#ff8f45', '#27e0c0', '#c8ef5a']

const REFERENCE_ROWS: { id: string; label: string; kind: 'reps' | 'hold' | 'time' }[] = [
  { id: 'ex_tractions_pronation', label: 'Tractions strictes', kind: 'reps' },
  { id: 'ex_tractions_lestees', label: 'Tractions lestées', kind: 'reps' },
  { id: 'ex_pompes', label: 'Pompes', kind: 'reps' },
  { id: 'ex_dips', label: 'Dips', kind: 'reps' },
  { id: 'ex_dips_lestes', label: 'Dips lestés', kind: 'reps' },
  { id: 'ex_muscle_up', label: 'Muscle-up', kind: 'reps' },
  { id: 'ex_lsit', label: 'L-sit', kind: 'hold' },
  { id: 'ex_front_lever', label: 'Front lever', kind: 'hold' },
  { id: RUN_5K_REFERENCE_ID, label: '5 km', kind: 'time' },
]

function download(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function SettingsScreen({ param }: { param?: string }) {
  const data = useSoma()
  const s = data.settings
  const toast = useToast()
  const [editingExercise, setEditingExercise] = useState<ExerciseDef | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null)
  const [editingMetric, setEditingMetric] = useState<CustomMetric | null>(null)

  const patch = async (p: Partial<Settings>) => {
    await saveSettings(p)
  }

  const refValue = (id: string) => s.references.find((r) => r.exerciseId === id)
  const setRef = async (id: string, p: { reps?: number; loadKg?: number; holdSec?: number }) => {
    const next = s.references.filter((r) => r.exerciseId !== id)
    next.push({ exerciseId: id, ...refValue(id), ...p })
    await patch({ references: next })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      {toast.node}

      {/* ── Profil ── */}
      <Card title="Profil" subtitle="Ces valeurs servent au calcul de la charge et de la fatigue">
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Taille" hint="Jamais écrite dans le code.">
            <Stepper
              value={s.heightCm ?? 175}
              onChange={(v) => void patch({ heightCm: v })}
              min={120}
              max={230}
              suffix="cm"
            />
          </Field>
          <Field label="Poids du corps" hint="Indispensable pour les exercices lestés.">
            <Stepper
              value={s.weightKg ?? 70}
              onChange={(v) => void patch({ weightKg: v })}
              step={0.5}
              precision={1}
              min={30}
              max={200}
              suffix="kg"
            />
          </Field>
          <Field label="Année de naissance" optional>
            <Stepper
              value={s.birthYear ?? 1995}
              onChange={(v) => void patch({ birthYear: v, hrZones: defaultHrZones(new Date().getFullYear() - v) })}
              min={1930}
              max={2020}
            />
          </Field>
          <Field label="Niveau de référence">
            <Select
              value={s.level}
              onChange={(v) => void patch({ level: v as Settings['level'] })}
              options={[
                { value: 'debutant', label: 'Débutant' },
                { value: 'intermediaire', label: 'Intermédiaire' },
                { value: 'avance', label: 'Avancé' },
              ]}
            />
          </Field>
        </div>
      </Card>

      {/* ── Références ── */}
      <Card
        title="Références par exercice"
        subtitle="Tes maxima propres : ils calibrent l’effort relatif"
        action={
          <Button
            className="px-2.5 py-1.5 text-[0.7rem]"
            onClick={() => void patch({ references: STARTING_REFERENCES })}
          >
            Valeurs de départ
          </Button>
        }
      >
        <div className="mt-3 space-y-2">
          {REFERENCE_ROWS.map((row) => {
            const ref = refValue(row.id)
            return (
              <div key={row.id} className="flex flex-wrap items-center gap-2">
                <span className="w-36 shrink-0 text-xs text-mist-300">{row.label}</span>
                {row.kind === 'reps' && (
                  <>
                    <div className="w-32">
                      <Stepper
                        value={ref?.reps ?? 0}
                        onChange={(v) => void setRef(row.id, { reps: v })}
                        min={0}
                        max={500}
                        suffix="reps"
                      />
                    </div>
                    {row.id.includes('lest') && (
                      <div className="w-28">
                        <Stepper
                          value={ref?.loadKg ?? 0}
                          onChange={(v) => void setRef(row.id, { loadKg: v })}
                          min={0}
                          max={120}
                          suffix="kg"
                        />
                      </div>
                    )}
                  </>
                )}
                {row.kind === 'hold' && (
                  <div className="w-32">
                    <Stepper
                      value={ref?.holdSec ?? 0}
                      onChange={(v) => void setRef(row.id, { holdSec: v })}
                      min={0}
                      max={900}
                      suffix="s"
                    />
                  </div>
                )}
                {row.kind === 'time' && (
                  <>
                    <div className="w-32">
                      <Stepper
                        value={Math.round((ref?.holdSec ?? 1200) / 60)}
                        onChange={(v) =>
                          void setRef(row.id, { holdSec: v * 60 + ((ref?.holdSec ?? 0) % 60) })
                        }
                        min={10}
                        max={90}
                        suffix="min"
                      />
                    </div>
                    <div className="w-28">
                      <Stepper
                        value={(ref?.holdSec ?? 1200) % 60}
                        onChange={(v) =>
                          void setRef(row.id, {
                            holdSec: Math.floor((ref?.holdSec ?? 1200) / 60) * 60 + v,
                          })
                        }
                        min={0}
                        max={59}
                        suffix="s"
                      />
                    </div>
                    <span className="text-xs text-mist-700 tnum">
                      {fmtClock(ref?.holdSec ?? 1200)}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Préférences ── */}
      <Card title="Préférences">
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Objectif de sommeil">
            <Stepper
              value={s.sleepGoalHours}
              onChange={(v) => void patch({ sleepGoalHours: v })}
              step={0.25}
              precision={2}
              min={5}
              max={12}
              suffix="h"
            />
          </Field>
          <Field label="Début de semaine" group>
            <Segmented
              value={String(s.weekStartsOn)}
              onChange={(v) => void patch({ weekStartsOn: Number(v) as 0 | 1 })}
              options={[
                { value: '1', label: 'Lundi' },
                { value: '0', label: 'Dimanche' },
              ]}
            />
          </Field>
          <Field label="Unités" group>
            <Segmented
              value={s.units}
              onChange={(v) => void patch({ units: v as Settings['units'] })}
              options={[
                { value: 'metric', label: 'Métrique' },
                { value: 'imperial', label: 'Impérial' },
              ]}
            />
          </Field>
          <Field label="Rendu du corps" group>
            <Segmented
              value={s.bodyRender}
              onChange={(v) => void patch({ bodyRender: v as Settings['bodyRender'] })}
              options={[
                { value: '3d', label: '3D' },
                { value: '2d', label: 'Vue 2D' },
              ]}
            />
          </Field>
        </div>

        <Field label="Couleur d’accent" group>
          <div className="mt-1 flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                onClick={() => void patch({ accent: c })}
                aria-label={`Accent ${c}`}
                className="h-9 w-9 rounded-full transition active:scale-95"
                style={{
                  background: c,
                  boxShadow: s.accent === c ? `0 0 0 2px #04070d, 0 0 0 4px ${c}` : `0 0 10px ${c}66`,
                }}
              />
            ))}
          </div>
        </Field>
      </Card>

      {/* ── Zones de FC ── */}
      <Card title="Zones de fréquence cardiaque">
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="FC max">
            <Stepper
              value={s.hrZones.maxHr}
              onChange={(v) => void patch({ hrZones: { ...s.hrZones, maxHr: v } })}
              min={120}
              max={230}
              suffix="bpm"
            />
          </Field>
          {s.hrZones.bounds.map((b, i) => (
            <Field key={i} label={`Seuil zone ${i + 1}`}>
              <Stepper
                value={b}
                onChange={(v) => {
                  const bounds = [...s.hrZones.bounds] as typeof s.hrZones.bounds
                  bounds[i] = v
                  void patch({ hrZones: { ...s.hrZones, bounds } })
                }}
                min={60}
                max={230}
                suffix="bpm"
              />
            </Field>
          ))}
        </div>
        <Button
          className="mt-3"
          onClick={() =>
            void patch({
              hrZones: defaultHrZones(new Date().getFullYear() - (s.birthYear ?? 1995)),
            })
          }
        >
          Recalculer depuis l’âge
        </Button>
      </Card>

      {/* ── Compte à rebours ── */}
      <Card title="Objectif à date" subtitle="Affiché sur l’accueil">
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Nom">
            <TextInput
              value={s.countdown?.name ?? ''}
              onChange={(e) =>
                void patch({
                  countdown: {
                    name: e.target.value,
                    date: s.countdown?.date ?? todayKey(),
                    discipline: s.countdown?.discipline,
                  },
                })
              }
            />
          </Field>
          <Field label="Date">
            <TextInput
              type="date"
              value={s.countdown?.date ?? ''}
              onChange={(e) =>
                void patch({
                  countdown: {
                    name: s.countdown?.name ?? 'Objectif',
                    date: e.target.value,
                    discipline: s.countdown?.discipline,
                  },
                })
              }
            />
          </Field>
          <Field label="Discipline" optional>
            <TextInput
              value={s.countdown?.discipline ?? ''}
              onChange={(e) =>
                void patch({
                  countdown: {
                    name: s.countdown?.name ?? 'Objectif',
                    date: s.countdown?.date ?? todayKey(),
                    discipline: e.target.value,
                  },
                })
              }
            />
          </Field>
        </div>
      </Card>

      {/* ── Bibliothèques ── */}
      <SectionTitle>Bibliothèques</SectionTitle>
      <Card padded>
        <Accordion>
          <AccordionItem
            id="exos"
            header={
              <span className="text-sm text-mist-100">
                Exercices{' '}
                <span className="text-mist-700">({data.exercises.filter((e) => !e.archived).length})</span>
              </span>
            }
          >
            <div className="space-y-2">
              <Button
                variant="primary"
                onClick={() =>
                  setEditingExercise({
                    id: uid('ex'),
                    name: 'Nouvel exercice',
                    kind: 'bodyweight',
                    unit: 'reps',
                    group: 'Perso',
                    mix: {},
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                + Créer un exercice
              </Button>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {[...data.exercises]
                  .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEditingExercise(structuredClone(e))}
                      className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/4 px-3 py-2 text-left text-xs hairline"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-mist-100">{e.name}</span>
                        <span className="text-mist-700">{e.group}</span>
                      </span>
                      {e.archived && <Badge>archivé</Badge>}
                    </button>
                  ))}
              </div>
            </div>
          </AccordionItem>

          <AccordionItem
            id="modeles"
            header={<span className="text-sm text-mist-100">Modèles de séances</span>}
          >
            <div className="space-y-2">
              <Button
                variant="primary"
                onClick={() =>
                  setEditingTemplate({
                    id: uid('tpl'),
                    name: 'Nouveau modèle',
                    kind: 'street',
                    items: [],
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                + Créer un modèle
              </Button>
              {data.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setEditingTemplate(structuredClone(t))}
                  className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/4 px-3 py-2 text-left text-xs hairline"
                >
                  <span className="truncate text-mist-100">{t.name}</span>
                  <span className="text-mist-700">{t.items.length} exercices</span>
                </button>
              ))}
            </div>
          </AccordionItem>

          <AccordionItem
            id="metriques"
            header={<span className="text-sm text-mist-100">Mes métriques</span>}
          >
            <div className="space-y-2">
              <Button
                variant="primary"
                onClick={() =>
                  setEditingMetric({
                    id: uid('cm'),
                    name: 'Nouvelle métrique',
                    unit: '',
                    min: 0,
                    max: 10,
                    color: '#9b7bff',
                    higherIsBetter: true,
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                + Créer une métrique
              </Button>
              {data.metrics.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setEditingMetric(structuredClone(m))}
                  className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/4 px-3 py-2 text-left text-xs hairline"
                >
                  <span className="truncate text-mist-100">{m.name}</span>
                  <span className="text-mist-700">
                    {m.min} → {m.max} {m.unit}
                  </span>
                </button>
              ))}
            </div>
          </AccordionItem>

          <AccordionItem
            id="types"
            header={<span className="text-sm text-mist-100">Types de séance personnalisés</span>}
          >
            <div className="space-y-1">
              {data.workoutTypes.map((t) => (
                <div key={t.id} className="rounded-xl bg-white/4 px-3 py-2 text-xs hairline">
                  <div className="text-mist-100">{t.name}</div>
                  <div className="text-mist-700">
                    {t.fields.map((f) => f.label).join(' · ') || 'Aucun champ'}
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[0.68rem] text-mist-700">
                Les types personnalisés apparaissent dans l’éditeur de séance et comptent dans la
                charge.
              </p>
            </div>
          </AccordionItem>
        </Accordion>
      </Card>

      {/* ── Moteur de fatigue ── */}
      <FatigueSettings config={s.fatigue} onChange={(f) => void patch({ fatigue: f })} />

      {/* ── Sync ── */}
      <SyncSettings param={param} />

      {/* ── Données ── */}
      <Card title="Mes données">
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              const b = await exportBackup()
              download(`soma-sauvegarde-${todayKey()}.json`, JSON.stringify(b, null, 2))
              toast.show('Export JSON téléchargé')
            }}
          >
            Export JSON
          </Button>
          <Button
            onClick={async () => {
              const b = await exportBackup()
              download(`soma-jours-${todayKey()}.csv`, checkinsToCsv(b.checkins, b.metrics), 'text/csv')
              download(`soma-seances-${todayKey()}.csv`, workoutsToCsv(b.workouts, b.exercises), 'text/csv')
              toast.show('Export CSV téléchargé')
            }}
          >
            Export CSV
          </Button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/6 px-4 py-2.5 text-sm font-medium text-mist-100 hairline">
            Importer JSON
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  const res = await importBackup(JSON.parse(await f.text()))
                  toast.show(`${res.checkins} jours et ${res.workouts} séances importés`)
                } catch (err) {
                  toast.show(err instanceof Error ? err.message : 'Import impossible')
                }
              }}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              const r = await generateDemoData()
              toast.show(`Démo : ${r.checkins} jours, ${r.workouts} séances`)
            }}
          >
            Générer des données de démo
          </Button>
          <Button
            onClick={async () => {
              await removeDemoData()
              toast.show('Données de démo supprimées')
            }}
          >
            Supprimer la démo
          </Button>
        </div>

        <div className="mt-4">
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Supprimer toutes mes données (jours, séances, objectifs) ?')) return
              await wipeData()
              toast.show('Données supprimées')
            }}
          >
            Supprimer toutes mes données
          </Button>
        </div>
      </Card>

      <p className="px-2 pb-4 text-center text-[0.68rem] text-mist-700">
        Soma · aucune IA, aucune API externe. Tous les calculs sont faits sur cet appareil.
      </p>

      {editingExercise && (
        <ExerciseEditor
          exercise={editingExercise}
          onClose={() => setEditingExercise(null)}
          onSaved={() => toast.show('Exercice enregistré')}
        />
      )}
      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => toast.show('Modèle enregistré')}
        />
      )}
      {editingMetric && (
        <MetricEditor
          metric={editingMetric}
          onClose={() => setEditingMetric(null)}
          onSaved={() => toast.show('Métrique enregistrée')}
        />
      )}
    </div>
  )
}

/* ── Moteur de fatigue ──────────────────────────────────────────────── */

function FatigueSettings({
  config,
  onChange,
}: {
  config: FatigueConfig
  onChange: (c: FatigueConfig) => void
}) {
  const sizes: ZoneSize[] = ['small', 'medium', 'large']
  const sizeLabel: Record<ZoneSize, string> = {
    small: 'Petits muscles',
    medium: 'Muscles moyens',
    large: 'Gros muscles',
  }
  const set = (p: Partial<FatigueConfig>) => onChange({ ...config, ...p })

  return (
    <Card
      title="Moteur de fatigue"
      subtitle="Toutes les constantes du calcul, ajustables à ton ressenti"
      action={
        <Button
          className="px-2.5 py-1.5 text-[0.7rem]"
          onClick={() => onChange(structuredClone(DEFAULT_FATIGUE_CONFIG))}
        >
          Valeurs par défaut
        </Button>
      }
    >
      <div className="mt-3 space-y-4">
        <div>
          <div className="mb-1.5 text-[0.68rem] tracking-wider text-mist-500 uppercase">
            Temps de récupération (τ, en heures)
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {sizes.map((size) => (
              <Field key={size} label={sizeLabel[size]}>
                <Stepper
                  value={config.tau[size]}
                  onChange={(v) => set({ tau: { ...config.tau, [size]: v } })}
                  min={6}
                  max={120}
                  suffix="h"
                />
              </Field>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[0.68rem] tracking-wider text-mist-500 uppercase">
            Saturation du volume (k)
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {sizes.map((size) => (
              <Field key={size} label={sizeLabel[size]}>
                <Stepper
                  value={config.k[size]}
                  onChange={(v) => set({ k: { ...config.k, [size]: v } })}
                  step={0.5}
                  precision={1}
                  min={1}
                  max={40}
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field
            label="Poids du pic d’intensité"
            hint="Plus haut = une série menée à l’échec compte davantage."
          >
            <Stepper
              value={config.peakWeight}
              onChange={(v) => set({ peakWeight: v })}
              step={0.05}
              precision={2}
              min={0}
              max={8}
            />
          </Field>
          <Field label="Plafond d’effort par série">
            <Stepper
              value={config.effortCap}
              onChange={(v) => set({ effortCap: v })}
              step={0.05}
              precision={2}
              min={1}
              max={2}
            />
          </Field>
          <Field label="Bonus si échec">
            <Stepper
              value={config.failureBonus}
              onChange={(v) => set({ failureBonus: v })}
              step={0.05}
              precision={2}
              min={1}
              max={2}
            />
          </Field>
          <Field label="Seuil « beaucoup pour moi »">
            <Stepper
              value={config.overreachRatio}
              onChange={(v) => set({ overreachRatio: v })}
              step={0.1}
              precision={1}
              min={1}
              max={4}
              suffix="×"
            />
          </Field>
          <Field label="Majoration correspondante">
            <Stepper
              value={Math.round(config.overreachBonus * 100)}
              onChange={(v) => set({ overreachBonus: v / 100 })}
              step={5}
              min={0}
              max={100}
              suffix="%"
            />
          </Field>
          <Field label="Seuil « prêt »">
            <Stepper
              value={config.readyThreshold}
              onChange={(v) => set({ readyThreshold: v })}
              step={1}
              min={5}
              max={60}
              suffix="%"
            />
          </Field>
          <Field label="Récupération pendant le sommeil (max)">
            <Stepper
              value={config.sleepMultiplier.max}
              onChange={(v) => set({ sleepMultiplier: { ...config.sleepMultiplier, max: v } })}
              step={0.05}
              precision={2}
              min={1}
              max={3}
              suffix="×"
            />
          </Field>
          <Field label="Récupération éveillé (min → max)" group>
            <div className="flex gap-2">
              <Stepper
                value={config.awakeMultiplier.min}
                onChange={(v) => set({ awakeMultiplier: { ...config.awakeMultiplier, min: v } })}
                step={0.05}
                precision={2}
                min={0.2}
                max={1.5}
              />
              <Stepper
                value={config.awakeMultiplier.max}
                onChange={(v) => set({ awakeMultiplier: { ...config.awakeMultiplier, max: v } })}
                step={0.05}
                precision={2}
                min={0.2}
                max={2}
              />
            </div>
          </Field>
          <Field label="Repos de référence" hint="Plus court = série plus intense.">
            <Stepper
              value={config.restRefSec}
              onChange={(v) => set({ restRefSec: v })}
              step={5}
              min={20}
              max={300}
              suffix="s"
            />
          </Field>
          <Field label="Effet du repos (par minute d'écart)">
            <Stepper
              value={Math.round(config.restSensitivity * 6000) / 100}
              onChange={(v) => set({ restSensitivity: v / 6000 })}
              step={1}
              min={0}
              max={30}
              suffix="%"
            />
          </Field>
          <Field label="Charge de course (par unité)">
            <Stepper
              value={config.runLoadPerMin}
              onChange={(v) => set({ runLoadPerMin: v })}
              step={0.1}
              precision={1}
              min={0.2}
              max={6}
            />
          </Field>
          <Field label="Charge cardio (par unité)">
            <Stepper
              value={config.cardioLoadPerMin}
              onChange={(v) => set({ cardioLoadPerMin: v })}
              step={0.1}
              precision={1}
              min={0.2}
              max={6}
            />
          </Field>
          <Field label="Bonus excentrique (D− / 100 m)">
            <Stepper
              value={config.downhillBonus}
              onChange={(v) => set({ downhillBonus: v })}
              step={0.01}
              precision={2}
              min={0}
              max={1}
            />
          </Field>
          <Field label="Poids du strain WHOOP">
            <Stepper
              value={Math.round(config.whoopStrainWeight * 100)}
              onChange={(v) => set({ whoopStrainWeight: v / 100 })}
              step={5}
              min={0}
              max={100}
              suffix="%"
            />
          </Field>
        </div>
      </div>
    </Card>
  )
}

/* ── Sync ───────────────────────────────────────────────────────────── */

function SyncSettings({ param }: { param?: string }) {
  const data = useSoma()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const toast = useToast()

  useMemo(() => {
    void currentEmail().then(setCurrent)
  }, [data.syncState])

  /* Lien reçu depuis l'autre appareil : on enregistre la configuration et on recharge. */
  useEffect(() => {
    const shared = param ? parseShared(param) : null
    if (!shared || SYNC_CONFIGURED) return
    if (validateSyncConfig(shared)) return
    saveSyncConfig(shared)
    window.location.hash = '#/reglages'
    window.location.reload()
  }, [param])

  if (!SYNC_CONFIGURED) {
    const appUrl = `${window.location.origin}${window.location.pathname}`
    const save = () => {
      const c = { url: url.trim(), key: key.trim() }
      const err = validateSyncConfig(c)
      if (err) return setFormError(err)
      saveSyncConfig(c)
      window.location.reload()
    }
    return (
      <Card title="Synchronisation entre appareils" subtitle="Désactivée : tout reste sur cet appareil">
        {toast.node}
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs text-mist-300">
          <li>
            Crée un compte gratuit sur <span className="text-mist-100">supabase.com</span>, puis{' '}
            <span className="text-mist-100">New project</span> (donne-lui un nom et un mot de passe, choisis la région la plus proche).
          </li>
          <li>
            Dans ton projet : <span className="text-mist-100">SQL Editor</span> → <span className="text-mist-100">New query</span> → colle le texte ci-dessous → <span className="text-mist-100">Run</span>.
            <div className="mt-1.5">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(schemaSql)
                    toast.show('Texte copié')
                  } catch {
                    toast.show('Copie impossible : sélectionne le texte à la main')
                  }
                }}
              >
                Copier le texte à coller
              </Button>
            </div>
          </li>
          <li>
            <span className="text-mist-100">Authentication → URL Configuration</span> : dans « Site URL » et « Redirect URLs », mets{' '}
            <code className="break-all text-accent">{appUrl}</code>
          </li>
          <li>
            <span className="text-mist-100">Project Settings → API</span> : copie « Project URL » et la clé{' '}
            <span className="text-mist-100">anon public</span> (jamais la clé « service_role »), puis colle-les ici.
          </li>
        </ol>
        <div className="mt-3 space-y-2">
          <Field label="Project URL">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" autoComplete="off" />
          </Field>
          <Field label="Clé anon public">
            <TextInput value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJ…" autoComplete="off" />
          </Field>
          <Button variant="primary" full onClick={save} disabled={!url.trim() || !key.trim()}>
            Activer la synchronisation
          </Button>
          {formError && <p className="text-xs text-[#ff8f8f]">{formError}</p>}
          <p className="text-[0.68rem] text-mist-700">
            Ces deux valeurs restent dans ton navigateur. Elles sont publiques par nature : tes données sont protégées par ton
            compte et par les règles de la base.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Synchronisation" subtitle="Connexion par lien magique, sans mot de passe">
      {toast.node}
      <div className="mt-2 text-xs text-mist-500">
        État :{' '}
        <span className="text-mist-100">
          {data.syncState.kind === 'idle'
            ? `synchronisé${data.syncState.pending ? ` (${data.syncState.pending} en attente)` : ''}`
            : data.syncState.kind === 'syncing'
              ? 'synchronisation en cours'
              : data.syncState.kind === 'error'
                ? data.syncState.message
                : 'non connecté'}
        </span>
      </div>

      {current ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge color="#41e08a">{current}</Badge>
          <Button
            onClick={async () => {
              await syncNow()
              toast.show('Synchronisation lancée')
            }}
          >
            Synchroniser maintenant
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await signOut()
              setCurrent(null)
            }}
          >
            Se déconnecter
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Field label="Adresse e-mail">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="moi@exemple.fr"
              autoComplete="email"
            />
          </Field>
          <Button
            variant="primary"
            onClick={async () => {
              setError(null)
              try {
                await sendMagicLink(email.trim())
                setSent(true)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Envoi impossible')
              }
            }}
            disabled={!email.includes('@')}
          >
            Recevoir le lien de connexion
          </Button>
          {sent && (
            <p className="text-xs text-[#41e08a]">
              Lien envoyé. Ouvre-le sur cet appareil pour terminer la connexion.
            </p>
          )}
          {error && <p className="text-xs text-[#ff8f8f]">{error}</p>}
        </div>
      )}
      {SYNC_FROM_BROWSER && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
          <Button
            onClick={async () => {
              const c = currentSyncConfig()
              if (!c) return
              try {
                await navigator.clipboard.writeText(shareLink(c))
                toast.show('Lien copié : ouvre-le sur ton téléphone')
              } catch {
                toast.show('Copie impossible')
              }
            }}
          >
            Copier le lien pour mon téléphone
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearSyncConfig()
              window.location.reload()
            }}
          >
            Retirer la configuration
          </Button>
        </div>
      )}
    </Card>
  )
}

/* ── Éditeurs ───────────────────────────────────────────────────────── */

function ExerciseEditor({
  exercise,
  onClose,
  onSaved,
}: {
  exercise: ExerciseDef
  onClose: () => void
  onSaved: () => void
}) {
  const [e, setE] = useState<ExerciseDef>(exercise)
  const patch = (p: Partial<ExerciseDef>) => setE((prev) => ({ ...prev, ...p }))
  const setMix = (zone: MuscleZone, v: number) => {
    const mix = { ...e.mix }
    if (v <= 0) delete mix[zone]
    else mix[zone] = v
    patch({ mix })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={e.name}
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            onClick={async () => {
              await saveExercise(e)
              onSaved()
              onClose()
            }}
          >
            Enregistrer
          </Button>
          <Button
            onClick={async () => {
              await saveExercise({ ...e, archived: !e.archived })
              onSaved()
              onClose()
            }}
          >
            {e.archived ? 'Réactiver' : 'Archiver'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <TextInput value={e.name} onChange={(ev) => patch({ name: ev.target.value })} />
          </Field>
          <Field label="Groupe">
            <TextInput value={e.group} onChange={(ev) => patch({ group: ev.target.value })} />
          </Field>
          <Field label="Nature">
            <Select
              value={e.kind}
              onChange={(v) => patch({ kind: v as ExerciseDef['kind'] })}
              options={[
                { value: 'bodyweight', label: 'Poids du corps' },
                { value: 'weighted', label: 'Charge externe' },
                { value: 'static', label: 'Statique (tenue)' },
                { value: 'core', label: 'Abdos / gainage' },
                { value: 'cardio', label: 'Cardio' },
              ]}
            />
          </Field>
          <Field label="Unité">
            <Select
              value={e.unit}
              onChange={(v) => patch({ unit: v as ExerciseDef['unit'] })}
              options={[
                { value: 'reps', label: 'Répétitions' },
                { value: 'seconds', label: 'Secondes' },
                { value: 'meters', label: 'Mètres' },
                { value: 'minutes', label: 'Minutes' },
              ]}
            />
          </Field>
          <Field label="Matériel" optional>
            <TextInput
              value={e.equipment ?? ''}
              onChange={(ev) => patch({ equipment: ev.target.value })}
            />
          </Field>
          <Field label="Part du poids du corps" hint="Tractions ≈ 1, pompes ≈ 0,65.">
            <Stepper
              value={e.bodyweightFactor ?? 0}
              onChange={(v) => patch({ bodyweightFactor: v })}
              step={0.05}
              precision={2}
              min={0}
              max={1.2}
            />
          </Field>
          {e.kind === 'static' ? (
            <Field label="Record de tenue">
              <Stepper
                value={e.referenceHoldSec ?? 30}
                onChange={(v) => patch({ referenceHoldSec: v })}
                min={1}
                max={900}
                suffix="s"
              />
            </Field>
          ) : (
            <>
              <Field label="Reps max de référence">
                <Stepper
                  value={e.referenceReps ?? 10}
                  onChange={(v) => patch({ referenceReps: v })}
                  min={1}
                  max={500}
                />
              </Field>
              <Field label="Lest de la référence" optional>
                <Stepper
                  value={e.referenceLoadKg ?? 0}
                  onChange={(v) => patch({ referenceLoadKg: v })}
                  min={0}
                  max={400}
                  suffix="kg"
                />
              </Field>
            </>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[0.68rem] tracking-wider text-mist-500 uppercase">
            Muscles sollicités
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MUSCLE_ZONES.map((z) => {
              const v = e.mix[z] ?? 0
              return (
                <div key={z} className="rounded-xl bg-white/4 p-2 hairline">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="truncate text-[0.68rem] text-mist-300">{ZONE_SHORT[z]}</span>
                    <span className="text-[0.68rem] text-mist-500 tnum">{v.toFixed(2)}</span>
                  </div>
                  <RangeSlider
                    value={v}
                    onChange={(n) => setMix(z, n)}
                    min={0}
                    max={1}
                    step={0.05}
                    color={v > 0 ? 'var(--accent)' : '#4f5f7a'}
                    label={ZONE_LABEL[z]}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: WorkoutTemplate
  onClose: () => void
  onSaved: () => void
}) {
  const data = useSoma()
  const [t, setT] = useState<WorkoutTemplate>(template)
  const [picker, setPicker] = useState(false)

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={t.name}
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            onClick={async () => {
              await saveTemplate(t)
              onSaved()
              onClose()
            }}
          >
            Enregistrer
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteTemplate(t.id)
              onClose()
            }}
          >
            Supprimer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <TextInput value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
          </Field>
          <Field label="Type">
            <Select
              value={t.kind}
              onChange={(v) => setT({ ...t, kind: v as WorkoutTemplate['kind'] })}
              options={Object.entries(WORKOUT_KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))}
            />
          </Field>
        </div>

        <div className="space-y-1.5">
          {t.items.map((item, i) => {
            const ex = data.exercises.find((e) => e.id === item.exerciseId)
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/4 p-2 hairline">
                <span className="min-w-0 flex-1 truncate text-xs text-mist-100">{ex?.name}</span>
                <div className="w-24">
                  <Stepper
                    value={item.sets}
                    onChange={(v) =>
                      setT({ ...t, items: t.items.map((x, n) => (n === i ? { ...x, sets: v, setList: undefined } : x)) })
                    }
                    min={1}
                    max={30}
                    suffix="sér."
                  />
                </div>
                <div className="w-28">
                  <Stepper
                    value={ex?.kind === 'static' ? (item.holdSec ?? 30) : (item.reps ?? 10)}
                    onChange={(v) =>
                      setT({
                        ...t,
                        items: t.items.map((x, n) =>
                          n === i
                            ? ex?.kind === 'static'
                              ? { ...x, holdSec: v, setList: undefined }
                              : { ...x, reps: v, setList: undefined }
                            : x,
                        ),
                      })
                    }
                    min={1}
                    max={500}
                    suffix={ex?.kind === 'static' ? 's' : 'reps'}
                  />
                </div>
                <IconButton
                  label="Retirer"
                  className="h-8 w-8"
                  onClick={() => setT({ ...t, items: t.items.filter((_, n) => n !== i) })}
                >
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5">
                    <path d="M5 10h10" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </IconButton>
              </div>
            )
          })}
        </div>

        <Button onClick={() => setPicker(true)}>+ Ajouter un exercice</Button>
        <Sheet open={picker} onClose={() => setPicker(false)} title="Choisir un exercice">
          <ExercisePicker
            onPick={(id) => {
              setT({ ...t, items: [...t.items, { exerciseId: id, sets: 4, reps: 10 }] })
              setPicker(false)
            }}
          />
        </Sheet>
      </div>
    </Sheet>
  )
}

function MetricEditor({
  metric,
  onClose,
  onSaved,
}: {
  metric: CustomMetric
  onClose: () => void
  onSaved: () => void
}) {
  const [m, setM] = useState<CustomMetric>(metric)
  return (
    <Sheet
      open
      onClose={onClose}
      title={m.name}
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            onClick={async () => {
              await saveMetric(m)
              onSaved()
              onClose()
            }}
          >
            Enregistrer
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteMetric(m.id)
              onClose()
            }}
          >
            Supprimer
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Nom">
          <TextInput value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Unité" optional>
            <TextInput value={m.unit ?? ''} onChange={(e) => setM({ ...m, unit: e.target.value })} />
          </Field>
          <Field label="Min">
            <Stepper value={m.min} onChange={(v) => setM({ ...m, min: v })} min={-1000} max={1000} />
          </Field>
          <Field label="Max">
            <Stepper value={m.max} onChange={(v) => setM({ ...m, max: v })} min={-1000} max={10000} />
          </Field>
        </div>
        <Field label="Couleur" group>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                onClick={() => setM({ ...m, color: c })}
                aria-label={`Couleur ${c}`}
                className="h-8 w-8 rounded-full"
                style={{
                  background: c,
                  boxShadow: m.color === c ? `0 0 0 2px #04070d, 0 0 0 4px ${c}` : 'none',
                }}
              />
            ))}
          </div>
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2.5 hairline">
          <span className="text-xs text-mist-300">Plus haut = mieux</span>
          <Toggle
            checked={!!m.higherIsBetter}
            onChange={(v) => setM({ ...m, higherIsBetter: v })}
            label="Plus haut est mieux"
          />
        </div>
      </div>
    </Sheet>
  )
}
