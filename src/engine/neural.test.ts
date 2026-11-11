import { describe, expect, it } from 'vitest'
import type { Deadline, Task } from '../types'
import { backgroundNet, bridgeAxeFor, buildKnowledgeGraph, buildTaskGraph, insideBrain, layoutGraph, mergeGraphs } from './neural'
import { buildImportPlan, parseClaudeMemory } from './knowledge'

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

const MEM = `Camille Test [profile] — Camille, 30 ans

* (stated) Aime courir

Cuisine [hub, axe cuisine] — La cuisine

* (stated) Tous les jours

Pâtisserie [area, axe cuisine] — Desserts

* (stated) Tarte [[Recettes été]] [[Marathon]]

Recettes été [topic, axe cuisine] — Fiches

* (stated) Salade

Marathon [project, axe course] — Objectif 4 h

* (verify) Record du 10 km : 48 ou 51 min ? [[Pâtisserie]]

Course [hub, axe course] — Courir

* (stated) 3 fois par semaine

Orpheline [note] — Sans axe

* (stated) Rien
`
const notes = buildImportPlan(parseClaudeMemory(MEM).notes, []).create

describe('graphe des connaissances', () => {
  const g = buildKnowledgeGraph(notes)
  const ids = (k: string) => g.nodes.filter((n) => n.kind === k).map((n) => n.noteId ?? n.id)

  it('les fiches « axe » deviennent les grands neurones, le profil devient le cœur', () => {
    expect(g.nodes.find((n) => n.id === 'core')?.noteId).toBe('kn_camille-test')
    expect(g.nodes.filter((n) => n.kind === 'axe').map((n) => n.label)).toEqual(['Course', 'Cuisine'])
    expect(g.nodes.find((n) => n.id === 'axe:cuisine')?.noteId).toBe('kn_cuisine')
    /* les fiches « axe » et « profil » ne sont pas dupliquées en neurones simples */
    expect(ids('note').sort()).toEqual(['kn_marathon', 'kn_orpheline', 'kn_patisserie', 'kn_recettes-ete'])
  })

  it('range chaque fiche sous son axe, les fiches sans axe sous le cœur', () => {
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'axe:cuisine', target: 'note:kn_patisserie' }))
    expect(g.links).toContainEqual(expect.objectContaining({ source: 'core', target: 'note:kn_orpheline' }))
  })

  it('les [[liens]] deviennent des synapses, sans doublon', () => {
    const syn = g.links.filter((l) => l.kind === 'link')
    expect(syn).toHaveLength(2)
    expect(syn).toContainEqual(expect.objectContaining({ source: 'note:kn_patisserie', target: 'note:kn_recettes-ete' }))
    /* lien croisé entre deux axes : Pâtisserie ↔ Marathon (cités dans les deux sens, une synapse) */
    expect(syn.filter((l) => [l.source, l.target].every((x) => /patisserie|marathon/.test(x)))).toHaveLength(1)
  })

  it('une fiche à trancher pulse, un domaine ressort', () => {
    expect(g.nodes.find((n) => n.id === 'note:kn_marathon')?.state).toBe('soon')
    expect(g.nodes.find((n) => n.id === 'note:kn_patisserie')?.state).toBe('high')
  })

  it('filtre par axe', () => {
    const f = buildKnowledgeGraph(notes, { axes: ['cuisine'] })
    expect(f.nodes.filter((n) => n.kind === 'axe').map((n) => n.axe)).toEqual(['cuisine'])
    expect(f.nodes.some((n) => n.id === 'note:kn_marathon')).toBe(false)
    expect(f.nodes.some((n) => n.id === 'note:kn_orpheline')).toBe(false)
  })

  it('fusion avec les tâches : un seul cœur, ponts catégories ↔ axes, placement dans le cerveau', () => {
    const t = buildTaskGraph(tasks, deadlines, TODAY)
    const merged = mergeGraphs(t, buildKnowledgeGraph(notes))
    expect(merged.nodes.filter((n) => n.id === 'core')).toHaveLength(1)
    expect(merged.nodes.find((n) => n.id === 'core')?.noteId).toBe('kn_camille-test')
    const pos = layoutGraph(merged)
    expect([...pos.values()].every((p) => p.every(Number.isFinite) && insideBrain(p, 1.2))).toBe(true)
  })

  it('tient la charge avec ~130 fiches', () => {
    const many = Array.from({ length: 130 }, (_, i) => ({
      ...notes[2],
      id: `kn_${i}`,
      title: `Fiche ${i}`,
      axe: ['cuisine', 'course', 'sport', 'alpha', 'x'][i % 5],
      links: [`Fiche ${(i * 7) % 130}`],
    }))
    const g2 = buildKnowledgeGraph(many)
    const pos = layoutGraph(g2)
    expect(pos.size).toBe(g2.nodes.length)
    expect([...pos.values()].every((p) => insideBrain(p, 1.2))).toBe(true)
  })
})

describe('ponts tâches ↔ axes, sans noms codés en dur', () => {
  it('rapproche une catégorie de tâches de l’axe de même nature', () => {
    const slugs = ['cuisine', 'course', 'vie-pro', 'etudes', 'bien-etre', 'sport']
    expect(bridgeAxeFor('ecole', slugs)).toBe('etudes')
    expect(bridgeAxeFor('business', slugs)).toBe('vie-pro')
    expect(bridgeAxeFor('sport', slugs)).toBe('sport')
    expect(bridgeAxeFor('perso', slugs)).toBe('bien-etre')
    expect(bridgeAxeFor('ecole', ['cuisine', 'course'])).toBeUndefined()
  })

  it('chaque axe a sa couleur et le placement reste stable quand on filtre', () => {
    const all = buildKnowledgeGraph(notes)
    const f = buildKnowledgeGraph(notes, { axes: ['course'] })
    const colorOf = (g: typeof all, id: string) => g.nodes.find((n) => n.id === id)?.color
    expect(colorOf(all, 'axe:course')).toBe(colorOf(f, 'axe:course'))
    expect(colorOf(all, 'axe:course')).not.toBe(colorOf(all, 'axe:cuisine'))
    expect(all.nodes.find((n) => n.id === 'axe:course')?.anchor).toEqual(f.nodes.find((n) => n.id === 'axe:course')?.anchor)
  })
})
