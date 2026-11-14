import type { TaskCategory } from '../../types'
import { CATEGORY_COLOR, CATEGORY_LABEL, CATEGORY_ORDER } from '../../engine/tasks'

/** Catégories à choisir (plusieurs possibles) : une touche ajoute ou retire. Il en reste toujours au moins une. */
export default function CategoryChips({
  value,
  onChange,
  small,
}: {
  value: TaskCategory[]
  onChange: (v: TaskCategory[]) => void
  small?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Catégories">
      {CATEGORY_ORDER.map((c) => {
        const on = value.includes(c)
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? value.filter((x) => x !== c) : [...value, c]
              onChange(next.length ? next : value)
            }}
            className={`flex items-center gap-1.5 rounded-full transition ${small ? 'px-2 py-0.5 text-[0.66rem]' : 'px-2.5 py-1 text-xs'}`}
            style={{
              color: on ? CATEGORY_COLOR[c] : '#7c8dab',
              background: on ? `${CATEGORY_COLOR[c]}1f` : '#ffffff08',
              boxShadow: `inset 0 0 0 1px ${on ? `${CATEGORY_COLOR[c]}55` : '#ffffff12'}`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? CATEGORY_COLOR[c] : '#4f5f7a' }} />
            {CATEGORY_LABEL[c]}
          </button>
        )
      })}
    </div>
  )
}
