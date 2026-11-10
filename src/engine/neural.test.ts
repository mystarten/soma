import { describe, expect, it } from 'vitest'
import type { Deadline, Task } from '../types'
import { backgroundNet, buildTaskGraph, insideBrain, layoutGraph } from './neural'

const TODAY = '2026-11-10'
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  priority: 'normale',
  category: 'perso',
  status: 'a_faire',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const tasks = [
  task('maths', { category: 'ecole', priority: 'haute', due: TODAY }),
  task('anglais', { category: 'ecole', due: TODAY }),
  task('facture', { category: 'business', due: '2026-11-05' }),
  task('pain'),
  task('faite', { status: 'fait', completedAt: `${TODAY}T08:00:00.000Z` }),
  task('supprimee', { deleted: true }),
]
const deadlines: Deadline[] = [
  { id: 'oral', title: 'Oral', date: '2026-11-14', kind: 'oral', category: 'ecole', updatedAt: '' },
  { id: 'concours', title: 'Concours', date: '2026-12-20', kind: 'concours', updatedAt: '' },
  { id: 'passee', title: 'Passée', date: '2026-11-01', kind: 'rendu', updatedAt: '' },
]

describe('graphe du cerveau', () => {
  const g = buildTaskGraph(tasks, deadlines, TODAY)

  it('un cœur, 4 grandes zones, les tâches ouvertes et les échéances à venir', () => {
    const kinds = (k: string) => g.nodes.filter((n) => n.kind === k).map((n) => n.ref ?? n.id)
    expect(kinds('core')).toEqual(['core'])
    expect(kinds('hub')).toHaveLength(4)
    expect(kinds('task').sort()).toEqual(['anglais', 'facture', 'maths', 'pain'])
    expect(kinds('deadline').sort()).toEqual(['concours', 'oral'])
  })

  it('chaque tâche est reliée à sa zone, les tâches du même jour entre elles', () => {
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'hub:ecole', target: 'task:maths' }))
    expect(g.links.filter((l) => l.kind === 'day')).toHaveLength(1)
    /* échéance sans catégorie : reliée au cœur */
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'core', target: 'deadline:concours' }))
  })

  it('états lisibles : prioritaire, en retard, échéance proche', () => {
    const state = (id: string) => g.nodes.find((n) => n.id === id)?.state
    expect(state('task:maths')).toBe('high')
    expect(state('task:facture')).toBe('overdue')
    expect(state('deadline:oral')).toBe('soon')
  })

  it('filtre par catégorie et affiche les faites du jour sur demande', () => {
    const f = buildTaskGraph(tasks, deadlines, TODAY, { categories: ['ecole'], showDone: true })
    expect(f.nodes.filter((n) => n.kind === 'hub')).toHaveLength(1)
    expect(f.nodes.filter((n) => n.kind === 'task').map((n) => n.ref).sort()).toEqual(['anglais', 'maths'])
    const d = buildTaskGraph(tasks, [], TODAY, { showDone: true })
    expect(d.nodes.some((n) => n.ref === 'faite' && n.state === 'done')).toBe(true)
  })
})

describe('placement 3D', () => {
  it('déterministe, sans valeur invalide, et contenu dans le cerveau', () => {
    const g = buildTaskGraph(tasks, deadlines, TODAY)
    const a = layoutGraph(g)
    const b = layoutGraph(g)
    expect([...a.values()]).toEqual([...b.values()])
    for (const p of a.values()) {
      expect(p.every(Number.isFinite)).toBe(true)
      expect(insideBrain(p, 1.15)).toBe(true)
    }
    expect(a.get('core')).toEqual([0, 0, 0])
  })

  it('tient la charge avec beaucoup de tâches', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      task(`t${i}`, { category: (['ecole', 'business', 'sport', 'perso'] as const)[i % 4], due: TODAY }),
    )
    const p = layoutGraph(buildTaskGraph(many, [], TODAY), 120)
    expect(p.size).toBe(125)
    expect([...p.values()].every((v) => insideBrain(v, 1.2))).toBe(true)
  })

  it('le maillage de fond remplit le cerveau et relie chaque point', () => {
    const net = backgroundNet(200, 3)
    expect(net.points.length).toBe(200)
    expect(net.points.every((p) => insideBrain(p))).toBe(true)
    expect(net.edges.length).toBeGreaterThan(250)
  })
})
