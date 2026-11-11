import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type {
  BodyFatigue,
  CheckIn,
  CustomMetric,
  DayKey,
  Deadline,
  KnowledgeNote,
  ExerciseDef,
  Program,
  WeeklyReview,
  Goal,
  GoalProgress,
  Observation,
  Settings,
  SyncState,
  Task,
  Workout,
  WorkoutTemplate,
  WorkoutTypeDef,
} from '../types'
import { db, FALLBACK_BODY_WEIGHT_KG } from '../db/db'
import { ensureSeeded, referencePaceSecPerKm } from '../db/seed'
import { readSettings } from '../db/repo'
import { fatigueAt, prepareFatigue, type FatigueContext, type PreparedFatigue } from '../engine/fatigue'
import { computeObservations } from '../engine/observations'
import { alignmentScore, evaluateGoal, goalPeriod, type GoalContext } from '../engine/goals'
import { computeSleepScore } from '../engine/sleep'
import { computeCardioScore } from '../engine/cardio'
import { loadBalance, type LoadContext } from '../engine/load'
import { todayKey } from '../engine/time'
import { onSyncState, startSync } from '../sync/syncEngine'

export interface SomaData {
  ready: boolean
  today: DayKey
  settings: Settings
  checkins: CheckIn[]
  workouts: Workout[]
  exercises: ExerciseDef[]
  templates: WorkoutTemplate[]
  workoutTypes: WorkoutTypeDef[]
  goals: Goal[]
  metrics: CustomMetric[]
  tasks: Task[]
  deadlines: Deadline[]
  notes: KnowledgeNote[]
  program: Program | null
  reviews: WeeklyReview[]
  checkinByDay: Map<DayKey, CheckIn>
  bodyWeightKg: number
  fatigueCtx: FatigueContext
  loadCtx: LoadContext
  goalCtx: GoalContext
  prepared: PreparedFatigue
  body: BodyFatigue
  sleepScore: ReturnType<typeof computeSleepScore>
  cardioScore: ReturnType<typeof computeCardioScore>
  balance: ReturnType<typeof loadBalance>
  observations: Observation[]
  goalProgress: GoalProgress[]
  alignment: number
  syncState: SyncState
  /** Horodatage recalculé toutes les minutes, pour que le corps « vive ». */
  nowMs: number
}

const SomaContext = createContext<SomaData | null>(null)

export function SomaProvider({ children }: { children: ReactNode }) {
  const [seeded, setSeeded] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [syncState, setSyncState] = useState<SyncState>({ kind: 'disabled' })

  useEffect(() => {
    void ensureSeeded().then(() => setSeeded(true))
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => onSyncState(setSyncState), [])
  useEffect(() => startSync(), [])

  const settings = useLiveQuery(() => readSettings(), [seeded])
  const checkins = useLiveQuery(() => db.checkins.toArray(), [seeded], [] as CheckIn[])
  const workouts = useLiveQuery(() => db.workouts.toArray(), [seeded], [] as Workout[])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [seeded], [] as ExerciseDef[])
  const templates = useLiveQuery(() => db.templates.toArray(), [seeded], [] as WorkoutTemplate[])
  const workoutTypes = useLiveQuery(() => db.workoutTypes.toArray(), [seeded], [] as WorkoutTypeDef[])
  const goals = useLiveQuery(() => db.goals.toArray(), [seeded], [] as Goal[])
  const metrics = useLiveQuery(() => db.metrics.toArray(), [seeded], [] as CustomMetric[])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [seeded], [] as Task[])
  const deadlines = useLiveQuery(() => db.deadlines.toArray(), [seeded], [] as Deadline[])
  const notes = useLiveQuery(() => db.notes.toArray(), [seeded], [] as KnowledgeNote[])
  const programs = useLiveQuery(() => db.programs.toArray(), [seeded], [] as Program[])
  const reviews = useLiveQuery(() => db.reviews.toArray(), [seeded], [] as WeeklyReview[])

  useEffect(() => {
    if (settings?.accent) document.documentElement.style.setProperty('--accent', settings.accent)
    if (settings?.accent) {
      document.documentElement.style.setProperty('--accent-soft', `${settings.accent}26`)
    }
  }, [settings?.accent])

  const value = useMemo<SomaData | null>(() => {
    if (!settings) return null
    const today = todayKey()
    const liveCheckins = (checkins ?? []).filter((c) => !c.deleted)
    const liveWorkouts = (workouts ?? []).filter((w) => !w.deleted)
    const liveGoals = (goals ?? []).filter((g) => !g.deleted)
    const bodyWeightKg = settings.weightKg ?? FALLBACK_BODY_WEIGHT_KG
    const checkinByDay = new Map<DayKey, CheckIn>(liveCheckins.map((c) => [c.day, c]))

    const fatigueCtx: FatigueContext = {
      workouts: liveWorkouts,
      checkins: liveCheckins,
      exercises: exercises ?? [],
      workoutTypes: workoutTypes ?? [],
      bodyWeightKg,
      references: settings.references,
      sleepGoalHours: settings.sleepGoalHours,
      config: settings.fatigue,
      referencePaceSecPerKm: referencePaceSecPerKm(settings),
    }
    const loadCtx: LoadContext = {
      exercises: exercises ?? [],
      bodyWeightKg,
      hrZones: settings.hrZones,
    }
    const goalCtx: GoalContext = {
      workouts: liveWorkouts,
      checkins: liveCheckins,
      exercises: exercises ?? [],
      customMetrics: metrics ?? [],
      bodyWeightKg,
      sleepGoalHours: settings.sleepGoalHours,
      weekStartsOn: settings.weekStartsOn,
      hrZones: settings.hrZones,
    }

    const prepared = prepareFatigue(fatigueCtx, nowMs)
    const body = fatigueAt(nowMs, fatigueCtx, prepared)
    const sleepScore = computeSleepScore(checkinByDay, today, settings.sleepGoalHours)
    const cardioScore = computeCardioScore(checkinByDay, today, liveWorkouts, settings.hrZones)
    const balance = loadBalance(today, liveWorkouts, liveCheckins, loadCtx)
    const observations = computeObservations({
      checkins: liveCheckins,
      workouts: liveWorkouts,
      exercises: exercises ?? [],
      bodyWeightKg,
      sleepGoalHours: settings.sleepGoalHours,
      hrZones: settings.hrZones,
      today,
    })
    const goalProgress = liveGoals
      .filter((g) => g.active)
      .map((g) => {
        const { from, to } = goalPeriod(g, today, settings.weekStartsOn)
        return evaluateGoal(g, from, to, goalCtx)
      })
    const alignment = alignmentScore(liveGoals, goalCtx, today)

    return {
      ready: seeded,
      today,
      settings,
      checkins: liveCheckins,
      workouts: liveWorkouts,
      exercises: exercises ?? [],
      templates: templates ?? [],
      workoutTypes: workoutTypes ?? [],
      goals: liveGoals,
      metrics: metrics ?? [],
      tasks: (tasks ?? []).filter((t) => !t.deleted),
      deadlines: (deadlines ?? []).filter((d) => !d.deleted),
      notes: (notes ?? []).filter((n) => !n.deleted),
      program: (programs ?? []).find((p) => !p.deleted) ?? null,
      reviews: (reviews ?? []).filter((r) => !r.deleted),
      checkinByDay,
      bodyWeightKg,
      fatigueCtx,
      loadCtx,
      goalCtx,
      prepared,
      body,
      sleepScore,
      cardioScore,
      balance,
      observations,
      goalProgress,
      alignment,
      syncState,
      nowMs,
    }
  }, [
    settings,
    checkins,
    workouts,
    exercises,
    templates,
    workoutTypes,
    goals,
    metrics,
    tasks,
    programs,
    reviews,
    deadlines,
    notes,
    nowMs,
    seeded,
    syncState,
  ])

  if (!value) {
    return (
      <div className="flex h-full items-center justify-center text-mist-500">
        <div className="animate-pulse text-sm tracking-widest uppercase">Soma</div>
      </div>
    )
  }
  return <SomaContext.Provider value={value}>{children}</SomaContext.Provider>
}

export function useSoma(): SomaData {
  const v = useContext(SomaContext)
  if (!v) throw new Error('useSoma doit être utilisé dans <SomaProvider>')
  return v
}
