import { describe, expect, it } from 'vitest'
import {
  findTemplateByName,
  isRememberable,
  normName,
  sortTemplates,
  templateItemSets,
  workoutFromTemplate,
  workoutToTemplate,
} from './templates'
import { makeSet, makeWorkout } from '../test/fixtures'

let n = 0
const id = () => `id${++n}`

const pullLourd = () =>
  makeWorkout({
    title: 'Pull Lourd',
    startedAt: '2026-11-09T18:00:00.000Z',
    durationMin: 85,
    rpe: 9,
    sets: [
      ...[1, 2, 3].map(() => makeSet('ex_tractions_lestees', { reps: 5, loadKg: 25, restSec: 90 })),
      makeSet('ex_tractions_pronation', { reps: 10, restSec: 60 }),
      makeSet('ex_tractions_pronation', { reps: 8, restSec: 60 }),
      makeSet('ex_tractions_pronation', { reps: 6, restSec: 60, failure: true }),
    ],
  })

describe('séances mémorisées', () => {
  it('garde séries × reps, lest et repos, et le détail quand les séries diffèrent', () => {
    const t = workoutToTemplate(pullLourd(), undefined, id)!
    expect(t.name).toBe('Pull Lourd')
    expect(t.items).toHaveLength(2)
    expect(t.items[0]).toMatchObject({ exerciseId: 'ex_tractions_lestees', sets: 3, reps: 5, loadKg: 25, restSec: 90 })
    expect(t.items[0].setList).toBeUndefined()
    expect(t.items[1].sets).toBe(3)
    expect(t.items[1].setList?.map((s) => s.reps)).toEqual([10, 8, 6])
    expect(t.items[1].setList?.[2].failure).toBe(true)
    expect(t.lastDoneAt).toBe('2026-11-09T18:00:00.000Z')
    expect(t.durationMin).toBe(85)
    expect(t.rpe).toBe(9)
  })

  it('refaire la séance redonne exactement les mêmes séries, avec de nouveaux identifiants', () => {
    const w = pullLourd()
    const t = workoutToTemplate(w, undefined, id)!
    const again = workoutFromTemplate(t, { id: 'new', day: '2026-11-12', startedAt: '2026-11-12T18:00:00.000Z' }, id)
    expect(again.day).toBe('2026-11-12')
    expect(again.title).toBe('Pull Lourd')
    expect(again.source).toBe('manual')
    expect(again.sets).toHaveLength(6)
    expect(again.sets!.map((s) => [s.exerciseId, s.reps, s.loadKg ?? 0, s.restSec])).toEqual([
      ['ex_tractions_lestees', 5, 25, 90],
      ['ex_tractions_lestees', 5, 25, 90],
      ['ex_tractions_lestees', 5, 25, 90],
      ['ex_tractions_pronation', 10, 0, 60],
      ['ex_tractions_pronation', 8, 0, 60],
      ['ex_tractions_pronation', 6, 0, 60],
    ])
    const ids = new Set([...w.sets!.map((s) => s.id), ...again.sets!.map((s) => s.id)])
    expect(ids.size).toBe(12) /* aucun identifiant partagé : modifier la copie ne touche pas l'original */
  })

  it('met à jour la séance existante au lieu d’en créer une autre', () => {
    const first = workoutToTemplate(pullLourd(), undefined, id)!
    const w2 = pullLourd()
    w2.sets = w2.sets!.map((s) => (s.exerciseId === 'ex_tractions_lestees' ? { ...s, reps: 6 } : s))
    const second = workoutToTemplate(w2, first, id)!
    expect(second.id).toBe(first.id)
    expect(second.items[0].reps).toBe(6)
  })

  it('retrouve une séance par son nom, sans tenir compte des accents ni de la casse', () => {
    const t = workoutToTemplate(pullLourd(), undefined, id)!
    expect(findTemplateByName([t], '  pull   LOURD ')).toBe(t)
    expect(findTemplateByName([t], 'Push')).toBeUndefined()
    expect(normName('Séance Épaules')).toBe('seance epaules')
  })

  it('ne mémorise que les séances faites à la main et titrées', () => {
    expect(isRememberable(pullLourd())).toBe(true)
    expect(isRememberable({ ...pullLourd(), title: '  ' })).toBe(false)
    expect(isRememberable({ ...pullLourd(), source: 'whoop' })).toBe(false)
    expect(isRememberable({ ...pullLourd(), source: 'demo' })).toBe(false)
    expect(isRememberable({ ...pullLourd(), planned: true })).toBe(false)
    expect(workoutToTemplate({ ...pullLourd(), title: '' }, undefined, id)).toBeNull()
  })

  it('un ancien modèle sans repos reçoit 90 s par défaut', () => {
    const sets = templateItemSets({ exerciseId: 'ex_pompes', sets: 4, reps: 25 }, id)
    expect(sets).toHaveLength(4)
    expect(sets.every((s) => s.restSec === 90 && s.reps === 25)).toBe(true)
  })

  it('trie par dernière fois faite', () => {
    const a = { ...workoutToTemplate(pullLourd(), undefined, id)!, name: 'A', lastDoneAt: '2026-11-01T00:00:00.000Z' }
    const b = { ...a, id: 'b', name: 'B', lastDoneAt: '2026-11-09T00:00:00.000Z' }
    const c = { ...a, id: 'c', name: 'C', lastDoneAt: undefined }
    expect(sortTemplates([a, c, b]).map((t) => t.name)).toEqual(['B', 'A', 'C'])
  })
})
