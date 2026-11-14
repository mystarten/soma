import type { DayKey, Deadline, Task, TaskCategory, TaskKind, TaskPriority } from '../types'
import { addDayKey } from './time'
import { categoriesOf } from './tasks'

/* ──────────────────────────────────────────────────────────────────────────
   Planning unique : tâches et échéances dans une seule liste, triée dans le temps.
   Ce qui est passé (jour et heure dépassés) quitte la liste et se range dans « passées ».
   ────────────────────────────────────────────────────────────────────────── */

export interface PlanItem {
  id: string
  source: 'task' | 'deadline'
  title: string
  day?: DayKey
  /** Heure `HH:MM`, facultative. */
  time?: string
  categories: TaskCategory[]
  kind: TaskKind | 'oral' | 'business' | 'autre'
  priority?: TaskPriority
  raw: Task | Deadline
}

export function planItems(tasks: Task[], deadlines: Deadline[]): PlanItem[] {
  const out: PlanItem[] = []
  for (const t of tasks) {
    if (t.deleted || t.status === 'fait') continue
    out.push({ id: t.id, source: 'task', title: t.title, day: t.due, time: t.dueTime, categories: categoriesOf(t), kind: t.kind ?? 'tache', priority: t.priority, raw: t })
  }
  for (const d of deadlines) {
    if (d.deleted || d.done) continue
    out.push({ id: d.id, source: 'deadline', title: d.title, day: d.date, categories: [d.category ?? 'perso'], kind: d.kind, raw: d })
  }
  return out.sort(compare)
}

const compare = (a: PlanItem, b: PlanItem) => {
  if (!a.day && !b.day) return a.title.localeCompare(b.title)
  if (!a.day) return 1
  if (!b.day) return -1
  return a.day.localeCompare(b.day) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
}

/** Passé : jour révolu, ou aujourd'hui avec une heure déjà dépassée. Une échéance sans heure dure toute la journée. */
export function isPast(item: Pick<PlanItem, 'day' | 'time'>, today: DayKey, nowHm: string): boolean {
  if (!item.day) return false
  if (item.day < today) return true
  return item.day === today && !!item.time && item.time < nowHm
}

export interface PlanGroup {
  key: 'today' | 'tomorrow' | 'week' | 'later' | 'undated'
  label: string
  items: PlanItem[]
}

export function groupPlan(items: PlanItem[], today: DayKey, nowHm: string): { groups: PlanGroup[]; past: PlanItem[] } {
  const past = items.filter((i) => isPast(i, today, nowHm))
  const live = items.filter((i) => !isPast(i, today, nowHm))
  const tomorrow = addDayKey(today, 1)
  const weekEnd = addDayKey(today, 6)
  const defs: [PlanGroup['key'], string, (i: PlanItem) => boolean][] = [
    ['today', 'Aujourd’hui', (i) => i.day === today],
    ['tomorrow', 'Demain', (i) => i.day === tomorrow],
    ['week', 'Cette semaine', (i) => !!i.day && i.day > tomorrow && i.day <= weekEnd],
    ['later', 'Plus tard', (i) => !!i.day && i.day > weekEnd],
    ['undated', 'Sans date', (i) => !i.day],
  ]
  return {
    groups: defs.map(([key, label, f]) => ({ key, label, items: live.filter(f) })).filter((g) => g.items.length),
    past: past.sort((a, b) => b.day!.localeCompare(a.day!) || (b.time ?? '').localeCompare(a.time ?? '')),
  }
}
