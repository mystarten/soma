import { describe, expect, it } from 'vitest'
import { buildAiContext, buildTrackingExport } from './exportJson'
import { programFromJson, PROGRAM_FORMAT_DOC } from './programJson'
import { makeWorkout } from '../test/fixtures'

describe('export du suivi', () => {
  it('contient le programme, l’avancement, les séances et les notes', () => {
    const sample = JSON.parse(/EXEMPLE\n([\s\S]*)$/.exec(PROGRAM_FORMAT_DOC)![1])
    const program = { id: 'program' as const, name: 'P', sessions: programFromJson(sample).program!.sessions, importedAt: '', updatedAt: '' }
    const w = makeWorkout({ id: 'w1', day: '2026-03-18', startedAt: '2026-03-18T10:00:00.000Z', title: 'M1 · S1', notes: 'EMOM facile', rpe: 7, program: [{ code: 'M1', week: 1 }] })
    const mark = makeWorkout({ id: 'm', day: '2000-01-01', startedAt: '2000-01-01T00:00:00.000Z', backfill: true, program: [{ code: 'M1', week: 2 }] })
    const t = buildTrackingExport({ program, workouts: [w, mark], exercises: [], now: 'x' })
    expect(t.progress.M1).toMatchObject({ done_weeks: [1, 2], next_week: 3 })
    expect(t.sessions).toHaveLength(1)
    expect(t.sessions[0]).toMatchObject({ date: '2026-03-18', notes: 'EMOM facile', programme: ['M1 S1'] })
    const ctx = buildAiContext(t)
    expect(ctx).toContain('soma-programme')
    expect(ctx).toContain('EMOM facile')
  })
})
