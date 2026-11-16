import { describe, expect, it } from 'vitest'
import type { Program } from '../types'
import { addBlock, addSession, addWeek, applyCellToAll, describeCell, moveBlock, removeBlock, removeSession, setCell, toggleWeekFlag, updateBlock } from './programEdit'

const base = (): Pick<Program, 'sessions'> => ({
  sessions: [{
    code: 'T1', title: 'Tirage', weeks: [{ n: 1, label: 'a' }, { n: 2, label: 'b' }],
    blocks: [{ name: 'Tractions', restSec: 90, cells: ['4 x 8', '4 x 9'] }, { name: 'Pompes', cells: ['3 x 10', '3 x 12'] }],
  }],
})

describe('édition du programme', () => {
  it('ajoute et supprime séances et exercices sans toucher à l’original', () => {
    const p = base()
    const a = addSession(p, 't5', 'Nouvelle')
    expect(a.sessions.map((s) => s.code)).toEqual(['T1', 'T5'])
    expect(a.sessions[1].blocks[0].cells).toHaveLength(2)
    expect(p.sessions).toHaveLength(1)
    expect(removeSession(a, 'T5').sessions).toHaveLength(1)
    expect(addBlock(p, 'T1').sessions[0].blocks).toHaveLength(3)
    expect(removeBlock(p, 'T1', 0).sessions[0].blocks[0].name).toBe('Pompes')
  })
  it('déplace, renomme et modifie les cases', () => {
    const p = base()
    expect(moveBlock(p, 'T1', 0, 1).sessions[0].blocks[0].name).toBe('Pompes')
    expect(moveBlock(p, 'T1', 0, -1).sessions[0].blocks[0].name).toBe('Tractions')
    expect(updateBlock(p, 'T1', 1, { restSec: 120, name: 'Dips' }).sessions[0].blocks[1]).toMatchObject({ restSec: 120, name: 'Dips' })
    expect(setCell(p, 'T1', 0, 1, '5 x 5 +10 kg').sessions[0].blocks[0].cells[1]).toBe('5 x 5 +10 kg')
    expect(applyCellToAll(p, 'T1', 0, 1).sessions[0].blocks[0].cells).toEqual(['4 x 9', '4 x 9'])
  })
  it('gère les semaines de décharge et de test, et une semaine en plus', () => {
    const p = toggleWeekFlag(base(), 'T1', 0, 'light')
    expect(p.sessions[0].weeks[0].light).toBe(true)
    const q = toggleWeekFlag(p, 'T1', 0, 'test')
    expect(q.sessions[0].weeks[0]).toMatchObject({ test: true, light: false })
    const w = addWeek(base())
    expect(w.sessions[0].weeks.map((x) => x.n)).toEqual([1, 2, 3])
    expect(w.sessions[0].blocks[0].cells).toEqual(['4 x 8', '4 x 9', '4 x 9'])
  })
  it('décrit une case comprise par le programme', () => {
    expect(describeCell('4 x 8 +20 kg')).toBe('4 séries : 8 à +20 kg')
    expect(describeCell('3 x 40 s')).toBe('3 séries : 40 s')
    expect(describeCell('repos')).toBe('Repos')
    expect(describeCell('')).toBe('')
    expect(describeCell('n’importe quoi')).toContain('Texte libre')
  })
})
