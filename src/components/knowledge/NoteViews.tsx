import { Fragment, useMemo, useState } from 'react'
import { useSoma } from '../../hooks/useSoma'
import type { KnowledgeKind, KnowledgeNote } from '../../types'
import {
  KIND_LABEL,
  KIND_ORDER,
  axeOf,
  axePalette,
  backlinks,
  extractTags,
  extractWikiLinks,
  factsToText,
  resolveLinks,
  textToFacts,
  titleIndex,
} from '../../engine/knowledge'
import { deleteNote, saveNote } from '../../db/repo'
import { uid } from '../../db/db'
import { Badge, Button, Field, Select, Sheet, TextArea, TextInput } from '../ui/primitives'

const AMBER = '#ffc24b'

/** Texte avec des [[liens]] cliquables et des #tags. */
function Inline({ text, onOpen, known }: { text: string; onOpen: (title: string) => void; known: Set<string> }) {
  const parts = text.split(/(\[\[[^\]\n]+?\]\]|(?:^|\s)#[\p{L}\d][\p{L}\d_-]*)/gu)
  return (
    <>
      {parts.map((p, i) => {
        const w = /^\[\[([^\]\n]+?)\]\]$/.exec(p)
        if (w) {
          const title = w[1].split('|')[0].trim()
          const shown = (w[1].split('|')[1] ?? title).trim()
          const ok = known.has(title.toLowerCase())
          return (
            <button
              key={i}
              onClick={() => ok && onOpen(title)}
              className={`mx-0.5 rounded-md px-1.5 py-0.5 text-[0.8em] ${ok ? 'text-accent' : 'text-mist-700'}`}
              style={{ background: ok ? 'var(--accent-soft)' : '#ffffff08' }}
            >
              {shown}
            </button>
          )
        }
        if (/^\s?#/.test(p)) return <span key={i} className="text-mist-500">{p}</span>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

export function NoteReader({
  noteId,
  onClose,
  onOpen,
  onIsolate,
  onEdit,
}: {
  noteId: string
  onClose: () => void
  onOpen: (id: string) => void
  onIsolate?: (axe: string) => void
  onEdit: (n: KnowledgeNote) => void
}) {
  const data = useSoma()
  const note = data.notes.find((n) => n.id === noteId)
  const palette = useMemo(() => axePalette(data.notes), [data.notes])
  const index = useMemo(() => titleIndex(data.notes), [data.notes])
  const known = useMemo(() => new Set([...index.values()].map((n) => n.title.toLowerCase())), [index])
  if (!note) return null
  const info = note.axe ? axeOf(palette, note.axe) : null
  const { found, missing } = resolveLinks(note, index)
  const cited = backlinks(note, data.notes)
  const openByTitle = (t: string) => {
    const n = [...index.values()].find((x) => x.title.toLowerCase() === t.toLowerCase())
    if (n) onOpen(n.id)
  }
  const verify = note.facts.filter((f) => f.status === 'verify')

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={note.title}
      footer={
        <div className="flex gap-2">
          <Button variant="primary" full onClick={() => onEdit(note)}>
            Modifier
          </Button>
          {onIsolate && note.axe && (
            <Button onClick={() => onIsolate(note.axe!)}>Isoler « {info?.label} »</Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{KIND_LABEL[note.kind]}</Badge>
          {info && <Badge color={info.color}>{info.label}</Badge>}
          {verify.length > 0 && <Badge color={AMBER}>{verify.length} à trancher</Badge>}
          {note.source === 'claude' && <Badge>importée de Claude</Badge>}
          {note.tags.map((t) => (
            <Badge key={t}>#{t}</Badge>
          ))}
        </div>

        {note.summary && <p className="text-sm leading-relaxed text-mist-300">{note.summary}</p>}

        {note.facts.length > 0 && (
          <ul className="space-y-1.5">
            {note.facts.map((f, i) => (
              <li
                key={i}
                className="flex gap-2.5 rounded-xl px-3 py-2 text-[0.8rem] leading-relaxed"
                style={
                  f.status === 'verify'
                    ? { background: `${AMBER}10`, boxShadow: `inset 0 0 0 1px ${AMBER}33`, color: '#ffe3a3' }
                    : { background: '#ffffff08', color: 'var(--color-mist-300)' }
                }
              >
                <span className="shrink-0 pt-px" style={{ color: f.status === 'verify' ? AMBER : info?.color ?? '#7c8dab' }}>
                  {f.status === 'verify' ? '?' : '•'}
                </span>
                <span className="min-w-0 break-words">{f.text}</span>
              </li>
            ))}
          </ul>
        )}

        {note.body && (
          <div className="whitespace-pre-wrap rounded-xl bg-white/4 p-3 text-sm leading-relaxed text-mist-300 hairline">
            <Inline text={note.body} onOpen={openByTitle} known={known} />
          </div>
        )}

        {(found.length > 0 || missing.length > 0) && (
          <div>
            <h4 className="mb-1.5 text-[0.68rem] tracking-wider text-mist-500 uppercase">Liens</h4>
            <div className="flex flex-wrap gap-1.5">
              {found.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onOpen(n.id)}
                  className="rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    color: n.axe ? axeOf(palette, n.axe).color : '#b9c8e0',
                    background: '#ffffff08',
                    boxShadow: `inset 0 0 0 1px ${(n.axe ? axeOf(palette, n.axe).color : '#ffffff')}33`,
                  }}
                >
                  {n.title}
                </button>
              ))}
              {missing.map((t) => (
                <span key={t} className="rounded-lg bg-white/4 px-2.5 py-1.5 text-xs text-mist-700" title="Cette fiche n’existe pas encore">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {cited.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[0.68rem] tracking-wider text-mist-500 uppercase">Cité dans</h4>
            <div className="flex flex-wrap gap-1.5">
              {cited.map((n) => (
                <button key={n.id} onClick={() => onOpen(n.id)} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-mist-300 hairline">
                  {n.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

const NO_AXE = '__none__'

export function NoteEditor({ note, onClose, onSaved }: { note: KnowledgeNote; onClose: () => void; onSaved?: (n: KnowledgeNote) => void }) {
  const data = useSoma()
  const isNew = !data.notes.some((n) => n.id === note.id)
  const [n, setN] = useState<KnowledgeNote>(note)
  const [facts, setFacts] = useState(() => factsToText(note.facts))
  const patch = (p: Partial<KnowledgeNote>) => setN((prev) => ({ ...prev, ...p }))

  const axes = useMemo(
    () => [...axePalette(data.notes).values()].map((a) => ({ value: a.slug, label: a.label })),
    [data.notes],
  )

  const save = async () => {
    const title = n.title.trim()
    if (!title) return
    const factList = textToFacts(facts)
    const links = [
      ...new Set([
        ...extractWikiLinks(n.body),
        ...extractWikiLinks(n.summary),
        ...extractWikiLinks(facts),
        ...n.links.filter((l) => !extractWikiLinks(n.body).includes(l)),
      ]),
    ]
    const saved = await saveNote({
      ...n,
      title,
      facts: factList,
      links,
      tags: extractTags(`${n.body ?? ''} ${n.summary ?? ''}`),
      edited: n.source === 'claude' ? true : n.edited,
    })
    onSaved?.(saved)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title={isNew ? 'Nouvelle fiche' : 'Modifier la fiche'}
      footer={
        <div className="flex gap-2">
          <Button variant="primary" full disabled={!n.title.trim()} onClick={save}>
            Enregistrer
          </Button>
          {!isNew && (
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(`Supprimer « ${n.title} » ?`)) return
                await deleteNote(n.id)
                onClose()
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <Field label="Titre">
          <TextInput value={n.title} onChange={(e) => patch({ title: e.target.value })} autoFocus={isNew} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select
              value={n.kind}
              onChange={(v) => patch({ kind: v as KnowledgeKind })}
              options={KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            />
          </Field>
          <Field label="Axe">
            <Select
              value={n.axe ?? NO_AXE}
              onChange={(v) => patch({ axe: v === NO_AXE ? undefined : v })}
              options={[{ value: NO_AXE, label: 'Sans axe' }, ...axes]}
            />
          </Field>
        </div>
        <Field label="Résumé" optional>
          <TextInput value={n.summary ?? ''} onChange={(e) => patch({ summary: e.target.value })} placeholder="Une phrase" />
        </Field>
        <Field label="Faits" optional hint="Un par ligne. Commence une ligne par « ? » pour un doute à trancher.">
          <TextArea rows={6} value={facts} onChange={(e) => setFacts((e.target as HTMLTextAreaElement).value)} />
        </Field>
        <Field label="Notes libres" optional hint="Écris [[Titre d’une fiche]] pour la relier, et #tag pour classer.">
          <TextArea rows={5} value={n.body ?? ''} onChange={(e) => patch({ body: (e.target as HTMLTextAreaElement).value })} />
        </Field>
      </div>
    </Sheet>
  )
}

export function newNote(): KnowledgeNote {
  const now = new Date().toISOString()
  return { id: uid('kn'), title: '', kind: 'note', facts: [], links: [], tags: [], source: 'manual', createdAt: now, updatedAt: now }
}
