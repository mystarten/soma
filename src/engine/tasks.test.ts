import { describe, expect, it } from 'vitest'
import type { Deadline, Task } from '../types'
import {
  countdownLabel,
  doneToday,
  dueLabel,
  isOverdue,
  parseQuickAdd,
  taskLoad,
  tasksForView,
  upcomingDeadlines,
} from './tasks'

/* 2026-11-10 est un mardi. */
const TODAY = '2026-11-10'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  title: 'Tâche',
  priority: 'normale',
  category: 'perso',
  status: 'a_faire',
  createdAt: `2026-11-0${(n % 9) + 1}T08:00:00.000Z`,
  updatedAt: '2026-11-01T08:00:00.000Z',
  ...over,
})

describe('ajout rapide', () => {
  it('lit date, heure, priorité et catégorie, et nettoie le titre', () => {
    const r = parseQuickAdd('rendu maths demain 14h !haute #école', TODAY)
    expect(r).toEqual({
      title: 'Rendu maths',
      due: '2026-11-11',
      dueTime: '14:00',
      priority: 'haute',
      category: 'ecole',
    })
  })

  it('une ligne simple reste une tâche perso normale, sans date', () => {
    expect(parseQuickAdd('acheter du pain', TODAY)).toEqual({
      title: 'Acheter du pain',
      due: undefined,
      dueTime: undefined,
      priority: 'normale',
      category: 'perso',
    })
  })

  it('comprend les formulations de date courantes', () => {
    expect(parseQuickAdd('x aujourd’hui', TODAY).due).toBe(TODAY)
    expect(parseQuickAdd('x auj', TODAY).due).toBe(TODAY)
    expect(parseQuickAdd('x après-demain', TODAY).due).toBe('2026-11-12')
    expect(parseQuickAdd('x vendredi', TODAY).due).toBe('2026-11-13')
    expect(parseQuickAdd('x mardi', TODAY).due).toBe('2026-11-17') /* même jour → semaine suivante */
    expect(parseQuickAdd('x le 25/12', TODAY).due).toBe('2026-12-25')
    expect(parseQuickAdd('x 03/01', TODAY).due).toBe('2027-01-03') /* loin dans le passé → année suivante */
    expect(parseQuickAdd('x 05/11', TODAY).due).toBe('2026-11-05') /* passé récent → en retard */
    expect(parseQuickAdd('x 12/11/2027', TODAY).due).toBe('2027-11-12')
    expect(parseQuickAdd('x dans 3 jours', TODAY).due).toBe('2026-11-13')
    expect(parseQuickAdd('x dans 2 semaines', TODAY).due).toBe('2026-11-24')
    expect(parseQuickAdd('x +5j', TODAY).due).toBe('2026-11-15')
    expect(parseQuickAdd('x le 5', TODAY).due).toBe('2026-12-05')
    expect(parseQuickAdd('x semaine prochaine', TODAY).due).toBe('2026-11-16')
    expect(parseQuickAdd('x ce week-end', TODAY).due).toBe('2026-11-14')
    expect(parseQuickAdd('appeler banque pour demain', TODAY)).toMatchObject({ title: 'Appeler banque', due: '2026-11-11' })
  })

  it('priorités et catégories, accents et alias compris', () => {
    expect(parseQuickAdd('x !!', TODAY).priority).toBe('haute')
    expect(parseQuickAdd('x !b', TODAY).priority).toBe('basse')
    expect(parseQuickAdd('x #ecole', TODAY).category).toBe('ecole')
    expect(parseQuickAdd('x #boulot', TODAY).category).toBe('business')
    expect(parseQuickAdd('x #sport', TODAY).category).toBe('sport')
    /* un #tag inconnu reste dans le titre */
    expect(parseQuickAdd('lire #roman', TODAY)).toMatchObject({ title: 'Lire #roman', category: 'perso' })
  })

  it('ne confond pas une heure invalide ni un nombre isolé', () => {
    expect(parseQuickAdd('faire 30h de révisions', TODAY).dueTime).toBeUndefined()
    expect(parseQuickAdd('lire 20 pages', TODAY)).toMatchObject({ title: 'Lire 20 pages', due: undefined })
  })
})

describe('vues de la to-do', () => {
  const tasks = [
    task({ title: 'retard', due: '2026-11-07' }),
    task({ title: 'auj basse', due: TODAY, priority: 'basse' }),
    task({ title: 'auj haute', due: TODAY, priority: 'haute' }),
    task({ title: 'jeudi', due: '2026-11-12' }),
    task({ title: 'semaine pro', due: '2026-11-18' }),
    task({ title: 'sans date' }),
    task({ title: 'faite', due: TODAY, status: 'fait', completedAt: `${TODAY}T09:00:00.000Z` }),
    task({ title: 'supprimée', due: TODAY, deleted: true }),
  ]

  it('Aujourd’hui : seulement le jour, priorité haute en tête, sans les faites', () => {
    expect(tasksForView(tasks, 'today', TODAY).map((t) => t.title)).toEqual(['auj haute', 'auj basse'])
  })

  it('Cette semaine : d’aujourd’hui à dimanche', () => {
    expect(tasksForView(tasks, 'week', TODAY).map((t) => t.title)).toEqual(['auj haute', 'auj basse', 'jeudi'])
  })

  it('En retard : échéance passée et non faite', () => {
    expect(tasksForView(tasks, 'overdue', TODAY).map((t) => t.title)).toEqual(['retard'])
    expect(isOverdue(tasks[0], TODAY)).toBe(true)
    expect(isOverdue(tasks[6], TODAY)).toBe(false)
  })

  it('Toutes : les tâches ouvertes, y compris sans date', () => {
    expect(tasksForView(tasks, 'all', TODAY)).toHaveLength(6)
    expect(doneToday(tasks, TODAY).map((t) => t.title)).toEqual(['faite'])
  })

  it('résume la charge du jour', () => {
    expect(taskLoad(tasks, TODAY)).toEqual({ today: 2, overdue: 1, highToday: 1, week: 3 })
  })

  it('libellés d’échéance lisibles', () => {
    expect(dueLabel(task({ due: '2026-11-07' }), TODAY)).toBe('En retard de 3 j')
    expect(dueLabel(task({ due: TODAY, dueTime: '14:00' }), TODAY)).toBe('Aujourd’hui · 14:00')
    expect(dueLabel(task({ due: '2026-11-11' }), TODAY)).toBe('Demain')
    expect(dueLabel(task({ due: '2026-11-13' }), TODAY)).toBe('Ven. 13')
    expect(dueLabel(task({ due: '2026-12-01' }), TODAY)).toBe('1/12')
    expect(dueLabel(task(), TODAY)).toBeNull()
  })
})

describe('échéances', () => {
  const dl = (title: string, date: string, over: Partial<Deadline> = {}): Deadline => ({
    id: title,
    title,
    date,
    kind: 'rendu',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  })
  const list = [
    dl('passée', '2026-11-01'),
    dl('oral', '2026-11-20', { kind: 'oral' }),
    dl('demain', '2026-11-11'),
    dl('faite', '2026-11-12', { done: true }),
    dl('a', '2026-12-01'),
    dl('b', '2026-12-02'),
    dl('c', '2026-12-03'),
    dl('d', '2026-12-04'),
  ]

  it('triées par date, sans les passées ni les faites, 5 au maximum', () => {
    expect(upcomingDeadlines(list, TODAY, 5).map((d) => d.title)).toEqual(['demain', 'oral', 'a', 'b', 'c'])
    expect(upcomingDeadlines(list, TODAY)).toHaveLength(6)
  })

  it('compte à rebours en jours', () => {
    expect(countdownLabel(dl('x', TODAY), TODAY)).toBe('Aujourd’hui')
    expect(countdownLabel(dl('x', '2026-11-11'), TODAY)).toBe('Demain')
    expect(countdownLabel(dl('x', '2026-11-20'), TODAY)).toBe('J-10')
    expect(countdownLabel(dl('x', '2026-11-01'), TODAY)).toBe('Passée')
  })
})
