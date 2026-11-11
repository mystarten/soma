import type {
  DayKey,
  Deadline,
  DeadlineKind,
  Task,
  TaskCategory,
  TaskKind,
  TaskPriority,
} from '../types'
import { addDayKey, dayDiff, parseDay, weekBounds } from './time'

/* ──────────────────────────────────────────────────────────────────────────
   To-do : ajout rapide au clavier, vues, retards, échéances.
   Aucune dépendance React — testé dans tasks.test.ts.
   ────────────────────────────────────────────────────────────────────────── */

export const KIND_LABEL: Record<TaskKind, string> = {
  tache: 'Tâche',
  rdv: 'Rendez-vous',
  concours: 'Concours',
  appel: 'Appel',
  rendu: 'À rendre',
  penser: 'À penser',
  achat: 'Achat',
}

/** Symbole court affiché devant la tâche. */
export const KIND_ICON: Record<TaskKind, string> = {
  tache: '○',
  rdv: '◷',
  concours: '★',
  appel: '✆',
  rendu: '✎',
  penser: '?',
  achat: '🛒',
}

export const KIND_ORDER: TaskKind[] = ['tache', 'rdv', 'concours', 'appel', 'rendu', 'penser', 'achat']

/** Mots en tête de titre qui désignent la nature de la tâche (« rdv médecin », « concours blanc »…). */
const KIND_WORDS: [RegExp, TaskKind][] = [
  [/^(rdv|rendez-?vous)\b/i, 'rdv'],
  [/^concours\b/i, 'concours'],
  [/^(appel|appeler|t[ée]l[ée]phoner)\b/i, 'appel'],
  [/^(rendre|rendu|remettre|à rendre|a rendre|deadline)\b/i, 'rendu'],
  [/^(penser|réfléchir|reflechir|r[ée]flexion|d[ée]cider)\b/i, 'penser'],
  [/^(acheter|achat|courses)\b/i, 'achat'],
]

/** Nature détectée au début du titre ; « tache » par défaut. */
export function detectKind(title: string): TaskKind {
  const t = title.trim()
  for (const [re, kind] of KIND_WORDS) if (re.test(t)) return kind
  return 'tache'
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  haute: 'Haute',
  normale: 'Normale',
  basse: 'Basse',
}

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  ecole: 'École',
  business: 'Business',
  sport: 'Sport',
  perso: 'Perso',
}

export const CATEGORY_COLOR: Record<TaskCategory, string> = {
  ecole: '#9b7bff',
  business: '#35e3ff',
  sport: '#41e08a',
  perso: '#ffc24b',
}

export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  rendu: 'Rendu',
  oral: 'Oral',
  concours: 'Concours',
  business: 'Deadline business',
  autre: 'Autre',
}

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const CATEGORY_ALIASES: Record<string, TaskCategory> = {
  ecole: 'ecole',
  cours: 'ecole',
  fac: 'ecole',
  school: 'ecole',
  etudes: 'ecole',
  business: 'business',
  biz: 'business',
  travail: 'business',
  boulot: 'business',
  pro: 'business',
  sport: 'sport',
  training: 'sport',
  perso: 'perso',
  personnel: 'perso',
  maison: 'perso',
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export interface QuickAddResult {
  title: string
  due?: DayKey
  dueTime?: string
  priority: TaskPriority
  category: TaskCategory
  kind: TaskKind
}

/**
 * Analyse une ligne tapée au clavier.
 *   « rendu maths demain 14h !haute #école »
 *   → titre « Rendu maths », demain, 14:00, priorité haute, école.
 * Dates : aujourd'hui, demain, après-demain, lundi…dimanche, 12/11,
 * 12/11/2026, le 12, dans 3 jours, +3j, semaine prochaine, ce week-end.
 */
export function parseQuickAdd(input: string, today: DayKey): QuickAddResult {
  let text = ` ${input.trim()} `
  let priority: TaskPriority = 'normale'
  let category: TaskCategory = 'perso'
  let due: DayKey | undefined
  let dueTime: string | undefined

  const take = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const m = re.exec(text)
    if (!m) return
    if (fn(m) === false) return
    text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)
  }

  /* Priorité */
  take(/\s(!{1,3}|!haute|!h|!urgent|!important|!basse|!b|!normale|!n)(?=\s)/i, (m) => {
    const t = strip(m[1])
    priority = t === '!basse' || t === '!b' ? 'basse' : t === '!normale' || t === '!n' ? 'normale' : 'haute'
  })

  /* Catégorie : premier #tag reconnu */
  for (const m of [...text.matchAll(/\s#([\p{L}\d_-]+)(?=\s)/gu)]) {
    const cat = CATEGORY_ALIASES[strip(m[1])]
    if (cat) {
      category = cat
      text = text.replace(m[0], ' ')
      break
    }
  }

  /* Heure */
  take(/\s(?:a\s|à\s)?(\d{1,2})(?:h(\d{2})?|:(\d{2}))(?=\s)/i, (m) => {
    const h = Number(m[1])
    const min = Number(m[2] ?? m[3] ?? 0)
    if (h > 23 || min > 59) return false
    dueTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  })

  /* Dates — un mot-liaison facultatif devant (pour, avant, d'ici, le, ce) */
  const lead = String.raw`\s(?:pour\s|avant\s|d'ici\s|d’ici\s)?`
  const dateRules: [RegExp, (m: RegExpExecArray) => DayKey | null][] = [
    [new RegExp(lead + String.raw`(?:aujourd['’]?hui|auj)(?=\s)`, 'i'), () => today],
    [new RegExp(lead + String.raw`apr[eè]s[-\s]?demain(?=\s)`, 'i'), () => addDayKey(today, 2)],
    [new RegExp(lead + String.raw`demain(?=\s)`, 'i'), () => addDayKey(today, 1)],
    [
      new RegExp(lead + String.raw`dans\s(\d{1,3})\s?(jours?|j|semaines?|sem)(?=\s)`, 'i'),
      (m) => addDayKey(today, Number(m[1]) * (/^s/i.test(m[2]) ? 7 : 1)),
    ],
    [/\s\+(\d{1,3})j(?=\s)/i, (m) => addDayKey(today, Number(m[1]))],
    [
      new RegExp(lead + String.raw`(?:la\s)?semaine\sprochaine(?=\s)`, 'i'),
      () => addDayKey(weekBounds(today, 1).start, 7),
    ],
    [
      new RegExp(lead + String.raw`(?:ce\s)?week[-\s]?end(?=\s)`, 'i'),
      () => {
        const dow = parseDay(today).getDay()
        return addDayKey(today, dow === 6 || dow === 0 ? 0 : 6 - dow)
      },
    ],
    [
      new RegExp(lead + String.raw`(?:le\s)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s)`, 'i'),
      (m) => {
        const d = Number(m[1])
        const mo = Number(m[2])
        if (d < 1 || d > 31 || mo < 1 || mo > 12) return null
        const t = parseDay(today)
        let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : t.getFullYear()
        let key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        /* Sans année : une date passée de plus de 60 jours vise l'an prochain ;
           plus récente, c'est un retard réel. */
        if (!m[3] && key < today && dayDiff(today, key) > 60) {
          y += 1
          key = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        }
        return key
      },
    ],
    [
      new RegExp(lead + String.raw`(?:ce\s|le\s)?(${WEEKDAYS.join('|')})(?:\sprochain)?(?=\s)`, 'i'),
      (m) => {
        const target = WEEKDAYS.indexOf(strip(m[1]))
        const dow = parseDay(today).getDay()
        const diff = (target - dow + 7) % 7 || 7
        return addDayKey(today, diff)
      },
    ],
    [
      new RegExp(lead + String.raw`le\s(\d{1,2})(?=\s)`, 'i'),
      (m) => {
        const d = Number(m[1])
        if (d < 1 || d > 31) return null
        const t = parseDay(today)
        let y = t.getFullYear()
        let mo = t.getMonth() + 1
        if (d < t.getDate()) {
          mo += 1
          if (mo > 12) {
            mo = 1
            y += 1
          }
        }
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      },
    ],
  ]
  for (const [re, fn] of dateRules) {
    let found = false
    take(re, (m) => {
      const r = fn(m)
      if (!r) return false
      due = r
      found = true
    })
    if (found) break
  }

  let title = text.replace(/\s+/g, ' ').trim().replace(/[\s,;:–-]+$/, '')
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1)
  return { title, due, dueTime, priority, category, kind: detectKind(title) }
}

/* ── Vues ─────────────────────────────────────────────────────────────── */

const PRIORITY_RANK: Record<TaskPriority, number> = { haute: 0, normale: 1, basse: 2 }

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

const open = (t: Task) => !t.deleted && t.status !== 'fait'

export function isOverdue(t: Task, today: DayKey): boolean {
  return open(t) && !!t.due && t.due < today
}

export function overdueDays(t: Task, today: DayKey): number {
  return t.due ? Math.max(0, dayDiff(today, t.due)) : 0
}

export type TaskView = 'today' | 'week' | 'overdue' | 'all'

/** Tâches ouvertes d'une vue, triées. */
export function tasksForView(
  tasks: Task[],
  view: TaskView,
  today: DayKey,
  weekStartsOn: 0 | 1 = 1,
): Task[] {
  const live = tasks.filter(open)
  const { end } = weekBounds(today, weekStartsOn)
  switch (view) {
    case 'today':
      return sortTasks(live.filter((t) => t.due === today))
    case 'week':
      /* Chronologique d'abord, puis priorité. */
      return sortTasks(live.filter((t) => !!t.due && t.due >= today && t.due <= end)).sort(
        (a, b) => (a.due ?? '').localeCompare(b.due ?? ''),
      )
    case 'overdue':
      return [...live.filter((t) => isOverdue(t, today))].sort(
        (a, b) => (a.due ?? '').localeCompare(b.due ?? '') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      )
    case 'all':
      return sortTasks(live)
  }
}

/** Tâches cochées aujourd'hui (affichées en discret sous la liste). */
export function doneToday(tasks: Task[], today: DayKey): Task[] {
  return tasks.filter((t) => !t.deleted && t.status === 'fait' && t.completedAt?.slice(0, 10) === today)
}

export interface DayLoadSummary {
  today: number
  overdue: number
  highToday: number
  week: number
}

export function taskLoad(tasks: Task[], today: DayKey, weekStartsOn: 0 | 1 = 1): DayLoadSummary {
  const t = tasksForView(tasks, 'today', today, weekStartsOn)
  return {
    today: t.length,
    overdue: tasksForView(tasks, 'overdue', today, weekStartsOn).length,
    highToday: t.filter((x) => x.priority === 'haute').length,
    week: tasksForView(tasks, 'week', today, weekStartsOn).length,
  }
}

/** « Aujourd'hui », « Demain », « Lun. 17 », « En retard de 2 j ». */
export function dueLabel(t: Task, today: DayKey): string | null {
  if (!t.due) return null
  const d = dayDiff(t.due, today)
  const time = t.dueTime ? ` · ${t.dueTime}` : ''
  if (d < 0) return `En retard de ${-d} j`
  if (d === 0) return `Aujourd’hui${time}`
  if (d === 1) return `Demain${time}`
  if (d < 7) {
    const name = WEEKDAYS[parseDay(t.due).getDay()]
    return `${name.charAt(0).toUpperCase()}${name.slice(1, 3)}. ${parseDay(t.due).getDate()}${time}`
  }
  return `${parseDay(t.due).getDate()}/${parseDay(t.due).getMonth() + 1}${time}`
}

/* ── Échéances ────────────────────────────────────────────────────────── */

export function daysLeft(d: Deadline, today: DayKey): number {
  return dayDiff(d.date, today)
}

/** Échéances à venir (non faites), triées par date. */
export function upcomingDeadlines(list: Deadline[], today: DayKey, limit?: number): Deadline[] {
  const out = list
    .filter((d) => !d.deleted && !d.done && d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  return limit ? out.slice(0, limit) : out
}

export function countdownLabel(d: Deadline, today: DayKey): string {
  const n = daysLeft(d, today)
  if (n < 0) return 'Passée'
  if (n === 0) return 'Aujourd’hui'
  if (n === 1) return 'Demain'
  return `J-${n}`
}
