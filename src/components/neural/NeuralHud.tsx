import { useEffect } from 'react'
import { CATEGORIES } from '../../engine/neural'
import { CATEGORY_COLOR, CATEGORY_LABEL } from '../../engine/tasks'
import { TaskEditor } from '../vie/TodoPanel'
import { DeadlineEditor } from '../vie/DeadlinesPanel'
import { NoteEditor, NoteReader } from '../knowledge/NoteViews'
import type { NeuralModel, NeuralMode } from './useNeuralModel'

const MODES: [NeuralMode, string][] = [
  ['tout', 'Tout'],
  ['taches', 'Tâches'],
  ['savoir', 'Savoir'],
  ['jour', 'Aujourd’hui'],
]

/**
 * Interface posée sur le bonhomme, dans sa propre carte. Elle apparaît en fondu quand on est
 * assez près pour voir les neurones, et disparaît de même en dézoomant : aucune page, aucune coupure.
 */
const KIND_NAME: Record<string, string> = {
  core: 'Toi',
  root: 'Regroupement',
  hub: 'Zone',
  axe: 'Axe de vie',
  task: 'Tâche',
  deadline: 'Échéance',
  note: 'Fiche',
}

export function NeuralHud({ model: m, deep, onBack }: { model: NeuralModel; deep: boolean; onBack: () => void }) {
  useEffect(() => {
    if (!deep) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !m.anyModal) onBack()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deep, m.anyModal, onBack])

  const auto = deep ? 'pointer-events-auto' : 'pointer-events-none'
  const title = m.mode === 'taches' ? 'Tes tâches' : m.mode === 'savoir' ? 'Ce que tu sais' : m.mode === 'jour' ? 'Ta journée' : 'Tout ton cerveau'

  return (
    <>
      {/* Étiquettes des neurones (positionnées à chaque image par la scène 3D) */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-300"
        style={{ opacity: deep ? 1 : 0 }}
        aria-hidden
      >
        {m.shownLabels.map((n) => (
          <div
            key={n.id}
            ref={(el) => {
              if (el) m.labels.current.set(n.id, el)
              else m.labels.current.delete(n.id)
            }}
            className="absolute top-0 left-0 max-w-[220px] truncate rounded-md px-2 py-0.5 text-[11px] leading-tight whitespace-nowrap"
            style={{
              opacity: 0,
              color: n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' ? n.color : n.state === 'overdue' ? '#ffb02e' : '#eaf2ff',
              background: m.hovered === n.id ? '#0b1626ee' : '#06101ccc',
              boxShadow: `0 0 0 1px ${n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' ? `${n.color}55` : '#ffffff18'}`,
              fontWeight: n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' || n.kind === 'core' ? 600 : 400,
              letterSpacing: n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' ? '0.08em' : undefined,
              textTransform: n.kind === 'hub' || n.kind === 'axe' || n.kind === 'root' ? 'uppercase' : undefined,
            }}
          >
            {n.kind === 'deadline' ? '◆ ' : ''}
            {n.label}
            {n.kind === 'root' ? ` · ${n.count ?? 0}${n.expanded ? ' ▾' : ' ▸'}` : ''}
          </div>
        ))}
      </div>

      {/* En-tête */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 transition-opacity duration-300 sm:p-4"
        style={{ opacity: deep ? 1 : 0 }}
      >
        <div className={`min-w-0 ${auto}`}>
          <div className="text-[0.58rem] tracking-[0.22em] text-mist-500 uppercase">Cerveau · réseau</div>
          <h2 className="text-base font-semibold text-mist-100 sm:text-lg">{title}</h2>
          <p className="text-[0.7rem] text-mist-500">
            {m.mode !== 'savoir' && (
              <>
                {m.open} tâche{m.open > 1 ? 's' : ''}
                {m.late ? <span style={{ color: '#ffb02e' }}> ({m.late} en retard)</span> : null}
              </>
            )}
            {m.mode !== 'savoir' && m.noteCount > 0 ? ' · ' : ''}
            {m.mode !== 'taches' && `${m.noteCount} fiche${m.noteCount > 1 ? 's' : ''}`}
            {m.mode !== 'savoir' && m.deadlines ? ` · ${m.deadlines} échéance${m.deadlines > 1 ? 's' : ''}` : ''}
          </p>
          <div className="mt-2 inline-flex gap-0.5 rounded-xl bg-white/5 p-0.5 hairline" role="tablist" aria-label="Contenu du réseau">
            {MODES.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={m.mode === k}
                onClick={() => m.setMode(k)}
                className={`rounded-lg px-2.5 py-1 text-xs transition ${m.mode === k ? 'bg-accent/18 text-accent' : 'text-mist-500 hover:text-mist-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              value={m.query}
              onChange={(e) => m.setQuery(e.target.value)}
              placeholder="Chercher…"
              aria-label="Chercher dans le réseau"
              tabIndex={deep ? 0 : -1}
              className="glass-strong w-32 rounded-xl px-3 py-1.5 text-xs text-mist-100 outline-none placeholder:text-mist-700 sm:w-44"
            />
            <button
              onClick={() => m.setTour(!m.tour)}
              aria-pressed={m.tour}
              className="glass-strong rounded-xl px-2.5 py-1.5 text-xs transition"
              style={{ color: m.tour ? 'var(--accent)' : '#b9c6dc' }}
              title="Visite guidée : le réseau tourne et s'arrête sur chaque zone"
            >
              {m.tour ? '■ Visite' : '▶ Visite'}
            </button>
            <button
              onClick={() => m.setSound(!m.sound)}
              aria-pressed={m.sound}
              className="glass-strong rounded-xl px-2.5 py-1.5 text-xs transition"
              style={{ color: m.sound ? 'var(--accent)' : '#7c8dab' }}
              title="Sons discrets"
            >
              {m.sound ? '♪ Son' : '♪ Muet'}
            </button>
          </div>
        </div>
        <button onClick={onBack} className={`${auto} glass-strong shrink-0 rounded-xl px-3 py-1.5 text-xs text-mist-100`}>
          Revenir au corps ✕
        </button>
      </div>

      {/* Filtres, sur une ligne qui défile */}
      <div
        className="pointer-events-none scroll-x absolute inset-x-0 top-[9.6rem] flex gap-1.5 px-3 transition-opacity duration-300 sm:top-[10rem] sm:px-4"
        style={{ opacity: deep ? 1 : 0 }}
      >
        {m.mode === 'taches' &&
          CATEGORIES.map((c) => {
            const on = m.cats.includes(c)
            return (
              <button
                key={c}
                onClick={() => m.toggleCat(c)}
                className={`${auto} flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] transition`}
                style={{
                  color: on ? CATEGORY_COLOR[c] : '#4f5f7a',
                  background: on ? `${CATEGORY_COLOR[c]}18` : '#ffffff06',
                  boxShadow: `inset 0 0 0 1px ${on ? `${CATEGORY_COLOR[c]}44` : '#ffffff12'}`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? CATEGORY_COLOR[c] : '#4f5f7a' }} />
                {CATEGORY_LABEL[c]}
              </button>
            )
          })}
        {m.mode !== 'taches' &&
          m.allAxes.map((slug) => {
            const info = m.axeOf(slug)
            const on = m.axes === null || m.axes.includes(slug)
            return (
              <button
                key={slug}
                onClick={() => m.toggleAxe(slug)}
                className={`${auto} flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.68rem] transition`}
                style={{
                  color: on ? info.color : '#4f5f7a',
                  background: on ? `${info.color}18` : '#ffffff06',
                  boxShadow: `inset 0 0 0 1px ${on ? `${info.color}44` : '#ffffff12'}`,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? info.color : '#4f5f7a' }} />
                {info.label}
              </button>
            )
          })}
        {m.mode !== 'savoir' && (
          <button
            onClick={() => m.setShowDone(!m.showDone)}
            className={`${auto} shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] transition`}
            style={{
              color: m.showDone ? '#b9c8e0' : '#4f5f7a',
              boxShadow: 'inset 0 0 0 1px #ffffff14',
              background: m.showDone ? '#ffffff10' : '#ffffff06',
            }}
          >
            faites aujourd’hui
          </button>
        )}
      </div>

      {/* Aperçu du neurone survolé ou sélectionné */}
      {m.preview && (
        <div
          className="pointer-events-none absolute bottom-24 left-3 z-10 w-[min(20rem,calc(100%-1.5rem))] transition-opacity duration-200 sm:left-4 sm:bottom-28"
          style={{ opacity: deep ? 1 : 0 }}
          aria-live="polite"
        >
          <div className={`${auto} glass-strong rounded-2xl p-3`} style={{ boxShadow: `inset 0 0 0 1px ${m.preview.node.color}44` }}>
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: m.preview.node.color, boxShadow: `0 0 10px ${m.preview.node.color}` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-mist-100">{m.preview.node.label}</div>
                <div className="text-[0.62rem] tracking-wider text-mist-500 uppercase">
                  {KIND_NAME[m.preview.node.kind]} · {m.preview.links} lien{m.preview.links > 1 ? 's' : ''}
                  {m.preview.node.age !== undefined && m.preview.node.age <= 3 ? ' · nouveau' : ''}
                </div>
              </div>
              {m.preview.pinned && (
                <button onClick={() => m.setSelected(null)} className="shrink-0 text-xs text-mist-500" aria-label="Fermer l’aperçu">
                  ✕
                </button>
              )}
            </div>
            {m.preview.lines.slice(0, 3).map((l) => (
              <p key={l} className="mt-1.5 line-clamp-2 text-xs text-mist-300">
                {l}
              </p>
            ))}
            {m.preview.suggestions.map((s) => (
              <button
                key={s.a + s.b}
                onClick={() => void m.relier(s.a, s.b)}
                className="mt-2 block w-full rounded-lg bg-[#ffe08a14] px-2.5 py-1.5 text-left text-[0.7rem] text-[#ffe08a]"
                style={{ boxShadow: 'inset 0 0 0 1px #ffe08a33' }}
              >
                Lien possible avec « {s.title} » ({s.shared.slice(0, 3).join(', ')}) — relier
              </button>
            ))}
            {m.preview.pinned && (
              <button
                onClick={() => m.openNode(m.preview!.node)}
                className="mt-2 w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-ink-950"
              >
                Ouvrir
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ajout rapide */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 p-3 transition-opacity duration-300 sm:p-4"
        style={{ opacity: deep ? 1 : 0 }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void m.add()
          }}
          className={`${auto} glass-strong flex w-full max-w-md items-center gap-2 rounded-2xl px-3.5`}
        >
          <span className="text-accent">+</span>
          <input
            value={m.text}
            onChange={(e) => m.setText(e.target.value)}
            placeholder="Nouveau neurone… ex. réviser oral jeudi !haute #école"
            aria-label="Ajouter une tâche au réseau"
            tabIndex={deep ? 0 : -1}
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-mist-100 outline-none placeholder:text-mist-700"
          />
        </form>
        <p className="text-center text-[0.62rem] text-mist-700">Touche un neurone pour le sélectionner, touche-le encore pour l’ouvrir · glisse pour tourner · molette pour zoomer</p>
      </div>
    </>
  )
}

export function NeuralModals({ model: m }: { model: NeuralModel }) {
  return (
    <>
      {m.task && <TaskEditor task={m.task} onClose={() => m.setTask(null)} />}
      {m.deadline && <DeadlineEditor deadline={m.deadline} onClose={() => m.setDeadline(null)} />}
      {m.reading && (
        <NoteReader
          noteId={m.reading}
          onClose={() => m.setReading(null)}
          onOpen={m.setReading}
          onIsolate={(slug) => {
            m.toggleAxe(slug, true)
            m.setReading(null)
            if (m.mode === 'taches') m.setMode('savoir')
          }}
          onEdit={(n) => {
            m.setReading(null)
            m.setEditingNote(n)
          }}
        />
      )}
      {m.editingNote && <NoteEditor note={m.editingNote} onClose={() => m.setEditingNote(null)} />}
    </>
  )
}
