import { useMemo } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { SOCLE_LABEL, SOCLE_ORDER, socleOf, type SocleRotation } from '../../engine/rotation'
import { Card } from '../ui/primitives'

const AMBER = '#d6b25b'
const BLUE = '#6fa8ff'
const GREEN = '#41e08a'

/**
 * Tableau complet du programme : une ligne par séance, une colonne par semaine.
 * ✓ = faite, ▶ = prochaine à faire. Les semaines de décharge (D) sont en jaune, les tests (T) en bleu,
 * et la semaine qui suit un test (« bilan ») est marquée en vert pour situer ta progression.
 */
export default function ProgramTable({
  program,
  rotation,
  done,
  onTick,
  onUndo,
}: {
  program: Program
  rotation: SocleRotation[]
  done: Map<string, Set<number>>
  onTick: (code: string, week: number) => void
  onUndo: (code: string, week: number) => void
}) {
  const data = useSoma()
  const weeksN = Math.max(0, ...program.sessions.flatMap((s) => s.weeks.map((w) => w.n)))
  const cols = useMemo(() => Array.from({ length: weeksN }, (_, i) => i + 1), [weeksN])

  const colInfo = useMemo(() => {
    const info = new Map<number, { light: boolean; test: boolean; label?: string; current: boolean }>()
    for (const n of cols) {
      const ws = program.sessions.map((s) => s.weeks.find((w) => w.n === n)).filter(Boolean)
      info.set(n, {
        light: ws.some((w) => w!.light),
        test: ws.some((w) => w!.test),
        label: ws.find((w) => w!.label)?.label,
        current: ws.some((w) => !!w!.startDay && !!w!.endDay && w!.startDay <= data.today && data.today <= w!.endDay),
      })
    }
    return info
  }, [cols, program.sessions, data.today])

  const socles = SOCLE_ORDER.filter((s) => program.sessions.some((x) => socleOf(x.code) === s))
  const nextOf = (code: string) => rotation.flatMap((r) => r.items).find((i) => i.code === code)?.nextWeek ?? null
  const afterTest = (n: number) => !!colInfo.get(n - 1)?.test

  return (
    <Card title="Tableau du programme" subtitle="Toutes tes séances, semaine par semaine. Touche une case pour cocher ou retirer." padded={false}>
      <div className="scroll-x px-3 pb-3 pt-2 sm:px-4">
        <table className="w-max border-separate border-spacing-y-1 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[7.5rem] bg-[#0a101c] pr-2 text-left align-bottom text-[0.62rem] font-normal tracking-wide text-mist-500 uppercase">Séance</th>
              {cols.map((n) => {
                const c = colInfo.get(n)!
                const post = afterTest(n)
                const tag = c.test ? 'Test' : c.light ? 'Décharge' : post ? 'Bilan' : ''
                const tone = c.test ? BLUE : c.light ? AMBER : post ? GREEN : '#8a9bb8'
                return (
                  <th key={n} className="min-w-[2.3rem] px-px text-center align-bottom font-normal">
                    <div className="rounded-t-lg px-1 pt-1 pb-1.5" style={{ background: tag ? `${tone}1f` : undefined, borderTop: c.current ? '2px solid var(--accent)' : '2px solid transparent' }}>
                      <div className="text-[0.62rem] leading-tight" style={{ color: tone }}>{tag || ' '}</div>
                      <div className={`text-sm font-semibold tnum ${c.current ? 'text-accent' : 'text-mist-100'}`}>S{n}</div>
                      {c.label && <div className="text-[0.55rem] leading-tight whitespace-nowrap text-mist-500">{c.label}</div>}
                    </div>
                  </th>
                )
              })}
              <th className="pl-2 text-right align-bottom text-[0.62rem] font-normal text-mist-500">Faites</th>
            </tr>
          </thead>
          <tbody>
            {socles.map((so) => {
              const sessions = program.sessions.filter((s) => socleOf(s.code) === so)
              return (
                <SocleRows key={so} label={SOCLE_LABEL[so] ?? so} colSpan={weeksN + 2}>
                  {sessions.map((s) => {
                    const d = done.get(s.code) ?? new Set<number>()
                    const next = nextOf(s.code)
                    return (
                      <tr key={s.code}>
                        <td className="sticky left-0 z-10 bg-[#0a101c] pr-2">
                          <div className="flex items-baseline gap-1.5">
                            <span className="w-7 shrink-0 text-xs font-semibold text-accent tnum">{s.code}</span>
                            <span className="max-w-[5.2rem] truncate text-[0.7rem] text-mist-300" title={s.title}>{s.title}</span>
                          </div>
                        </td>
                        {cols.map((n) => {
                          const w = s.weeks.find((x) => x.n === n)
                          const c = colInfo.get(n)!
                          const isDone = d.has(n)
                          const isNext = next === n
                          const tone = w?.test ? BLUE : w?.light ? AMBER : afterTest(n) ? GREEN : undefined
                          const colTint = c.test ? BLUE : c.light ? AMBER : afterTest(n) ? GREEN : undefined
                          if (!w) return <td key={n} className="px-0.5"><div className="h-8 rounded-md bg-white/3" /></td>
                          return (
                            <td key={n} className="px-0.5" style={{ background: colTint ? `${colTint}12` : undefined }}>
                              <button
                                onClick={() => (isDone ? onUndo(s.code, n) : onTick(s.code, n))}
                                aria-label={`${s.code} semaine ${n}${w.test ? ' (test)' : ''}${w.light ? ' (décharge)' : ''} : ${isDone ? 'faite, toucher pour retirer' : 'toucher pour cocher'}`}
                                className="grid h-8 w-full place-items-center rounded-md text-[0.8rem] transition active:scale-95"
                                style={
                                  isDone
                                    ? { background: `${GREEN}26`, color: GREEN, boxShadow: `inset 0 0 0 1px ${GREEN}55` }
                                    : isNext
                                      ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }
                                      : { background: '#ffffff0a', color: tone ?? '#56657d', boxShadow: tone ? `inset 0 0 0 1px ${tone}55` : undefined }
                                }
                              >
                                {isDone ? '✓' : isNext ? '▶' : w.test ? 'T' : w.light ? 'D' : ''}
                              </button>
                            </td>
                          )
                        })}
                        <td className="pl-2 text-right text-[0.7rem] text-mist-500 tnum">{d.size}/{s.weeks.length}</td>
                      </tr>
                    )
                  })}
                </SocleRows>
              )
            })}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.66rem] text-mist-500">
          <span><b style={{ color: GREEN }}>✓</b> faite</span>
          <span><b className="text-accent">▶</b> prochaine à faire</span>
          <span><b style={{ color: AMBER }}>D</b> semaine de décharge</span>
          <span><b style={{ color: BLUE }}>T</b> semaine de test</span>
          <span><b style={{ color: GREEN }}>Bilan</b> semaine qui suit un test : compare avec le test précédent</span>
        </div>
      </div>
    </Card>
  )
}

function SocleRows({ label, colSpan, children }: { label: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="sticky left-0 pt-2 text-[0.64rem] font-semibold tracking-[0.14em] text-mist-500 uppercase">{label}</td>
      </tr>
      {children}
    </>
  )
}
