import type { Program, ProgramBlock, ProgramSession, ProgramWeek } from '../types'
import { parseCell, type PlannedSet } from './program'

/* Modifications du programme faites à la main : fonctions pures qui renvoient une nouvelle copie. */

type P = Pick<Program, 'sessions'>
const clone = <T,>(x: T): T => structuredClone(x)

export function emptyBlock(weeks: number, name = 'Nouvel exercice'): ProgramBlock {
  return { name, restSec: 90, cells: Array.from({ length: weeks }, () => '') }
}

export function addSession(p: P, code: string, title: string): P {
  const c = clone(p)
  const base = c.sessions[0]?.weeks ?? Array.from({ length: 12 }, (_, i): ProgramWeek => ({ n: i + 1, label: '' }))
  const weeks = base.map((w) => ({ n: w.n, label: w.label, startDay: w.startDay, endDay: w.endDay, light: w.light, test: w.test }))
  c.sessions.push({ code: code.trim().toUpperCase(), title: title.trim() || 'Nouvelle séance', durationMin: 45, weeks, blocks: [emptyBlock(weeks.length)] })
  return c
}

export function removeSession(p: P, code: string): P {
  const c = clone(p)
  c.sessions = c.sessions.filter((s) => s.code !== code)
  return c
}

function withSession(p: P, code: string, fn: (s: ProgramSession) => void): P {
  const c = clone(p)
  const s = c.sessions.find((x) => x.code === code)
  if (s) fn(s)
  return c
}

export const updateSession = (p: P, code: string, patch: Partial<Pick<ProgramSession, 'title' | 'meta' | 'durationMin'>>): P =>
  withSession(p, code, (s) => Object.assign(s, patch))

export const addBlock = (p: P, code: string): P => withSession(p, code, (s) => s.blocks.push(emptyBlock(s.weeks.length)))

export const removeBlock = (p: P, code: string, bi: number): P => withSession(p, code, (s) => void s.blocks.splice(bi, 1))

export function moveBlock(p: P, code: string, bi: number, dir: -1 | 1): P {
  return withSession(p, code, (s) => {
    const j = bi + dir
    if (j < 0 || j >= s.blocks.length) return
    ;[s.blocks[bi], s.blocks[j]] = [s.blocks[j], s.blocks[bi]]
  })
}

export const updateBlock = (p: P, code: string, bi: number, patch: Partial<Pick<ProgramBlock, 'name' | 'note' | 'restSec'>>): P =>
  withSession(p, code, (s) => {
    if (s.blocks[bi]) Object.assign(s.blocks[bi], patch)
  })

export const setCell = (p: P, code: string, bi: number, wi: number, text: string): P =>
  withSession(p, code, (s) => {
    const b = s.blocks[bi]
    if (!b) return
    b.cells[wi] = text
    /* Le texte modifié à la main remplace la prescription structurée de cette semaine. */
    if (b.plans) b.plans[wi] = null
  })

/** Copie la case d'une semaine sur toutes les autres semaines du bloc. */
export const applyCellToAll = (p: P, code: string, bi: number, wi: number): P =>
  withSession(p, code, (s) => {
    const b = s.blocks[bi]
    if (!b) return
    const text = b.cells[wi] ?? ''
    const plan = b.plans?.[wi] ?? null
    b.cells = s.weeks.map(() => text)
    if (b.plans || plan) b.plans = s.weeks.map(() => (plan ? structuredClone(plan) : null))
  })

export const toggleWeekFlag = (p: P, code: string, wi: number, flag: 'light' | 'test'): P =>
  withSession(p, code, (s) => {
    const w = s.weeks[wi]
    if (!w) return
    w[flag] = !w[flag]
    if (w[flag]) w[flag === 'light' ? 'test' : 'light'] = false
  })

/** Ajoute une semaine à la fin de toutes les séances. */
export function addWeek(p: P): P {
  const c = clone(p)
  for (const s of c.sessions) {
    const n = (s.weeks[s.weeks.length - 1]?.n ?? 0) + 1
    s.weeks.push({ n, label: '' })
    for (const b of s.blocks) {
      b.cells.push(b.cells[b.cells.length - 1] ?? '')
      if (b.plans) b.plans.push(b.plans[b.plans.length - 1] ? structuredClone(b.plans[b.plans.length - 1]) : null)
    }
  }
  return c
}

/** Résumé lisible de ce que le programme comprend d'une case (aperçu sous le champ). */
export function describeCell(text: string): string {
  if (!text.trim()) return ''
  const cell = parseCell(text)
  if (cell.rest) return 'Repos'
  if (cell.test) return 'Test'
  if (!cell.sets.length || cell.sets.every((x) => !x.reps && !x.holdSec && !x.distanceM)) return 'Texte libre, sans séries chiffrées : écris par exemple « 4 x 8 +20 kg »'
  const one = (s: PlannedSet) => (s.holdSec ? `${s.holdSec} s` : s.reps ? `${s.reps}` : s.distanceM ? `${s.distanceM} m` : '?') + (s.loadKg ? ` à +${s.loadKg} kg` : '')
  const first = cell.sets[0]
  const same = cell.sets.every((s) => s.reps === first.reps && s.holdSec === first.holdSec && s.loadKg === first.loadKg)
  return same ? `${cell.sets.length} série${cell.sets.length > 1 ? 's' : ''} : ${one(first)}` : `${cell.sets.length} séries : ${cell.sets.map(one).join(' – ')}`
}
