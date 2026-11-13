import type { ProgramWeek } from '../../types'

/** Mention discrète : semaine légère en jaune atténué, semaine de test en bleu atténué. */
export function WeekNote({ week }: { week?: Pick<ProgramWeek, 'light' | 'test'> }) {
  if (!week?.light && !week?.test) return null
  return (
    <span className="text-[0.68rem] font-normal" style={{ color: week.test ? '#6fa8ffb3' : '#d6b25bb3' }}>
      · {week.test ? 'test' : 'légère'}
    </span>
  )
}
