import type { TaskKind } from '../../types'
import { KIND_ICON, KIND_LABEL, KIND_ORDER } from '../../engine/tasks'

/** Rangée de boutons « nature » (rendez-vous, concours, appel…), la même pour les tâches et les échéances. */
export default function KindPicker({
  value,
  onPick,
  kinds = KIND_ORDER,
}: {
  value: TaskKind
  onPick: (k: TaskKind) => void
  kinds?: TaskKind[]
}) {
  return (
    <div role="radiogroup" aria-label="Nature" className="scroll-x mt-2 flex gap-1.5">
      {kinds.map((k) => {
        const active = value === k
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(k)}
            style={{
              background: active ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : '#ffffff0d',
              color: active ? 'var(--accent)' : '#b9c6dc',
              boxShadow: active ? 'inset 0 0 0 1px var(--accent)' : 'none',
            }}
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] transition"
          >
            <span aria-hidden>{KIND_ICON[k]}</span>
            {KIND_LABEL[k]}
          </button>
        )
      })}
    </div>
  )
}
