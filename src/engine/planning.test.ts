import { describe, expect, it } from 'vitest'
import type { Deadline, Task } from '../types'
import { groupPlan, isPast, planItems } from './planning'

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, priority: 'normale', category: 'perso', status: 'a_faire', createdAt: '', updatedAt: '', ...over })
const dl = (id: string, date: string, over: Partial<Deadline> = {}): Deadline => ({ id, title: id, date, kind: 'concours', updatedAt: '', ...over })
const TODAY = '2026-11-14'

describe('planning unique', () => {
  const items = planItems(
    [
      task('a', { due: '2026-11-14', dueTime: '09:00' }),
      task('b', { due: '2026-11-14', dueTime: '18:30', categories: ['sport', 'concours'] }),
      task('c', { due: '2026-11-15' }),
      task('d', { due: '2026-11-18' }),
      task('e', { due: '2026-12-01' }),
      task('f'),
      task('g', { due: '2026-11-10' }),
      task('h', { status: 'fait', due: '2026-11-14' }),
      task('i', { deleted: true, due: '2026-11-14' }),
    ],
    [dl('J', '2026-11-20'), dl('K', '2026-11-13'), dl('L', '2026-11-14', { done: true })],
  )
  it('mélange tâches et échéances, sans les faites ni les supprimées', () => {
    expect(items.map((i) => i.id)).toEqual(['g', 'K', 'a', 'b', 'c', 'd', 'J', 'e', 'f'])
  })
  it('une tâche à 09:00 est passée à 10:00 mais une à 18:30 non ; sans heure, elle dure la journée', () => {
    expect(isPast({ day: TODAY, time: '09:00' }, TODAY, '10:00')).toBe(true)
    expect(isPast({ day: TODAY, time: '18:30' }, TODAY, '10:00')).toBe(false)
    expect(isPast({ day: TODAY }, TODAY, '23:59')).toBe(false)
    expect(isPast({ day: '2026-11-13' }, TODAY, '00:01')).toBe(true)
    expect(isPast({}, TODAY, '10:00')).toBe(false)
  })
  it('regroupe par jour et range le passé à part', () => {
    const { groups, past } = groupPlan(items, TODAY, '10:00')
    expect(groups.map((g) => g.key)).toEqual(['today', 'tomorrow', 'week', 'later', 'undated'])
    expect(groups[0].items.map((i) => i.id)).toEqual(['b'])
    expect(past.map((i) => i.id).sort()).toEqual(['K', 'a', 'g'])
  })
  it('plusieurs catégories conservées', () => {
    expect(items.find((i) => i.id === 'b')!.categories).toEqual(['sport', 'concours'])
  })
})
