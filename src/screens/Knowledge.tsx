import { useMemo, useState } from 'react'
import { useSoma } from '../hooks/useSoma'
import type { KnowledgeNote } from '../types'
import {
  CLAUDE_EXPORT_PROMPT,
  KIND_LABEL,
  KIND_PLURAL,
  axeOf,
  axePalette,
  buildImportPlan,
  groupNotes,
  matchingFact,
  parseClaudeMemory,
  searchNotes,
  verifyItems,
} from '../engine/knowledge'
import { saveNotes } from '../db/repo'
import { Badge, Button, Card, Dot, EmptyState, Sheet, TextInput, useToast } from '../components/ui/primitives'
import { NoteEditor, NoteReader, newNote } from '../components/knowledge/NoteViews'

const AMBER = '#ffc24b'

export default function Knowledge() {
  const data = useSoma()
  const [query, setQuery] = useState('')
  const [reading, setReading] = useState<string | null>(null)
  const [editing, setEditing] = useState<KnowledgeNote | null>(null)
  const [importing, setImporting] = useState(false)
  const [openAxes, setOpenAxes] = useState<Set<string>>(new Set())
  const toast = useToast()

  const groups = useMemo(() => groupNotes(data.notes), [data.notes])
  const palette = useMemo(() => axePalette(data.notes), [data.notes])
  const verify = useMemo(() => verifyItems(data.notes), [data.notes])
  const results = useMemo(() => (query.trim().length >= 2 ? searchNotes(data.notes, query) : null), [data.notes, query])

  const toggle = (slug: string) =>
    setOpenAxes((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  const NoteRow = ({ n, hint }: { n: KnowledgeNote; hint?: string | null }) => {
    const info = n.axe ? axeOf(palette, n.axe) : null
    const doubt = n.facts.some((f) => f.status === 'verify')
    return (
      <button
        onClick={() => setReading(n.id)}
        className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/5"
      >
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: info?.color ?? '#9fb6d6' }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-mist-100">{n.title}</span>
            {doubt && (
              <span className="shrink-0 rounded px-1.5 text-[0.6rem]" style={{ color: AMBER, background: `${AMBER}18` }}>
                à trancher
              </span>
            )}
          </span>
          <span className="line-clamp-2 text-[0.7rem] text-mist-500">{hint ?? n.summary ?? `${n.facts.length} faits`}</span>
        </span>
        <span className="shrink-0 pt-0.5 text-[0.62rem] text-mist-700">{n.facts.length}</span>
      </button>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {toast.node}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher dans mon cerveau…"
            aria-label="Chercher une fiche"
          />
        </div>
        <Button onClick={() => setImporting(true)}>Importer</Button>
        <Button variant="primary" onClick={() => setEditing(newNote())}>
          + Fiche
        </Button>
      </div>

      {data.notes.length === 0 ? (
        <Card>
          <EmptyState
            title="Ton cerveau est vide pour l’instant"
            hint="Importe ce que Claude sait de toi, ou crée une première fiche. Chaque fiche devient un neurone dans le réseau du cerveau."
            action={
              <Button variant="primary" className="mt-2" onClick={() => setImporting(true)}>
                Importer depuis Claude
              </Button>
            }
          />
        </Card>
      ) : results ? (
        <Card title={`${results.length} résultat${results.length > 1 ? 's' : ''}`} subtitle={`pour « ${query.trim()} »`}>
          <div className="mt-2 space-y-0.5">
            {results.slice(0, 40).map((n) => (
              <NoteRow key={n.id} n={n} hint={matchingFact(n, query) ?? n.summary} />
            ))}
            {!results.length && <p className="py-4 text-center text-xs text-mist-700">Aucune fiche ne correspond.</p>}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="px-1 text-xs text-mist-500">
            {data.notes.length} fiches · {groups.filter((g) => g.axe.slug).length} axes
            {verify.length ? <span style={{ color: AMBER }}> · {verify.length} à trancher</span> : null}
          </p>

          {verify.length > 0 && (
            <Card title="À trancher" subtitle="Des infos qui se contredisent ou qui sont à confirmer">
              <ul className="mt-2 space-y-1.5">
                {verify.slice(0, 8).map(({ note, fact }, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setReading(note.id)}
                      className="w-full rounded-xl px-3 py-2 text-left text-[0.78rem] leading-relaxed text-mist-300"
                      style={{ background: `${AMBER}0d`, boxShadow: `inset 0 0 0 1px ${AMBER}26` }}
                    >
                      <span className="mb-0.5 block text-[0.62rem] tracking-wide text-mist-500 uppercase">{note.title}</span>
                      {fact.text}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {groups.map((g) => {
            const open = openAxes.has(g.axe.slug)
            return (
              <section key={g.axe.slug || 'none'} className="glass overflow-hidden rounded-[var(--radius-card)]">
                <button
                  onClick={() => toggle(g.axe.slug)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <Dot color={g.axe.color} size={9} />
                  <span className="flex-1 text-[0.95rem] font-medium text-mist-100">{g.axe.label}</span>
                  <span className="text-xs text-mist-500 tnum">{g.count}</span>
                  <svg viewBox="0 0 20 20" className={`h-4 w-4 text-mist-500 transition-transform ${open ? 'rotate-180' : ''}`}>
                    <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
                {open && (
                  <div className="space-y-3 border-t border-white/8 px-2 py-3">
                    {g.kinds.map((k) => (
                      <div key={k.kind}>
                        <div className="mb-0.5 px-3 text-[0.62rem] tracking-wider text-mist-500 uppercase">
                          {KIND_PLURAL[k.kind]} <span className="text-mist-700">· {k.notes.length}</span>
                        </div>
                        {k.notes.map((n) => (
                          <NoteRow key={n.id} n={n} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {reading && (
        <NoteReader
          noteId={reading}
          onClose={() => setReading(null)}
          onOpen={setReading}
          onEdit={(n) => {
            setReading(null)
            setEditing(n)
          }}
        />
      )}
      {editing && <NoteEditor note={editing} onClose={() => setEditing(null)} onSaved={(n) => toast.show(`« ${n.title} » enregistrée`)} />}
      {importing && (
        <ImportSheet
          onClose={() => setImporting(false)}
          onDone={(c, u) => toast.show(`${c} fiches créées, ${u} mises à jour`)}
        />
      )}
    </div>
  )
}

/* ── Import : coller le texte (ou déposer un fichier), aperçu, valider ── */

function ImportSheet({ onClose, onDone }: { onClose: () => void; onDone: (created: number, updated: number) => void }) {
  const data = useSoma()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [tip, setTip] = useState(false)

  const parsed = useMemo(() => (text.trim() ? parseClaudeMemory(text) : null), [text])
  const plan = useMemo(() => (parsed ? buildImportPlan(parsed.notes, data.notes) : null), [parsed, data.notes])
  const summary = useMemo(() => {
    if (!parsed) return null
    const byAxe = new Map<string, number>()
    const byKind = new Map<string, number>()
    for (const n of parsed.notes) {
      byAxe.set(n.axe ?? '', (byAxe.get(n.axe ?? '') ?? 0) + 1)
      byKind.set(n.kind, (byKind.get(n.kind) ?? 0) + 1)
    }
    return {
      byAxe: [...byAxe.entries()].sort((a, b) => b[1] - a[1]),
      byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1]),
      facts: parsed.notes.reduce((s, n) => s + n.facts.length, 0),
      doubts: parsed.notes.reduce((s, n) => s + n.facts.filter((f) => f.status === 'verify').length, 0),
    }
  }, [parsed])

  const total = (plan?.create.length ?? 0) + (plan?.update.length ?? 0)
  const palette = useMemo(() => axePalette([...data.notes, ...(plan?.create ?? [])]), [data.notes, plan])

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title="Importer dans le cerveau"
      footer={
        <div className="flex gap-2">
          <Button
            variant="primary"
            full
            disabled={!total || busy}
            onClick={async () => {
              if (!plan) return
              setBusy(true)
              await saveNotes([...plan.create, ...plan.update])
              onDone(plan.create.length, plan.update.length)
              onClose()
            }}
          >
            {total ? `Importer ${total} fiche${total > 1 ? 's' : ''}` : 'Rien à importer'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
        </div>
      }
    >
      <div className="space-y-3 pb-2">
        <p className="text-xs leading-relaxed text-mist-500">
          Colle ici le texte exporté depuis Claude (une fiche par sujet). Tout est lu dans ton navigateur : rien n’est envoyé
          ailleurs. Réimporter met à jour les fiches sans créer de doublons, et ne touche jamais à celles que tu as modifiées.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Concours [area, axe sport] — Description courte\n\n* (stated) Un fait\n* (verify) Un doute [[Autre fiche]]'}
          aria-label="Texte à importer"
          rows={9}
          className="w-full resize-y rounded-xl bg-ink-900/70 px-3.5 py-3 font-mono text-[0.72rem] leading-relaxed text-mist-100 hairline outline-none placeholder:text-mist-700 focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white/6 px-3.5 py-2 text-xs text-mist-100 hairline">
          …ou choisir un fichier .txt / .md
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
            }}
          />
        </label>

        {parsed && plan && summary && (
          <div className="space-y-3 rounded-xl bg-white/4 p-3 hairline">
            {parsed.notes.length === 0 ? (
              <p className="text-xs text-[#ffc24b]">
                Aucune fiche reconnue. Chaque fiche doit commencer par « Titre [type, axe nom] — description ».
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat label="Nouvelles" value={plan.create.length} />
                  <Stat label="Mises à jour" value={plan.update.length} />
                  <Stat label="Faits" value={summary.facts} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.byAxe.map(([slug, n]) => {
                    const i = slug ? axeOf(palette, slug) : null
                    return (
                      <Badge key={slug || 'none'} color={i?.color}>
                        {i?.label ?? 'Sans axe'} · {n}
                      </Badge>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.byKind.map(([k, n]) => (
                    <Badge key={k}>
                      {KIND_LABEL[k as keyof typeof KIND_LABEL] ?? k} · {n}
                    </Badge>
                  ))}
                  {summary.doubts > 0 && <Badge color={AMBER}>{summary.doubts} à trancher</Badge>}
                </div>
                {plan.kept > 0 && (
                  <p className="text-[0.7rem] text-mist-500">{plan.kept} fiche(s) modifiée(s) à la main : conservées telles quelles.</p>
                )}
                {plan.unresolvedLinks.length > 0 && (
                  <p className="text-[0.7rem] text-mist-500">
                    {plan.unresolvedLinks.length} lien(s) vers des fiches absentes (affichés en grisé) :{' '}
                    {plan.unresolvedLinks.slice(0, 4).join(', ')}
                    {plan.unresolvedLinks.length > 4 ? '…' : ''}
                  </p>
                )}
              </>
            )}
            {parsed.warnings.length > 0 && (
              <details className="text-[0.7rem] text-mist-500">
                <summary className="cursor-pointer">{parsed.warnings.length} remarque(s)</summary>
                <ul className="mt-1 space-y-0.5">
                  {parsed.warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div>
          <button onClick={() => setTip((v) => !v)} className="text-xs text-accent">
            {tip ? 'Masquer' : 'Comment obtenir ce texte depuis Claude ?'}
          </button>
          {tip && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-mist-500">Envoie ce message à Claude, puis colle sa réponse ci-dessus :</p>
              <pre className="max-h-48 overflow-auto rounded-xl bg-ink-900/70 p-3 text-[0.7rem] leading-relaxed whitespace-pre-wrap text-mist-300 hairline">
                {CLAUDE_EXPORT_PROMPT}
              </pre>
              <Button className="px-3 py-1.5 text-xs" onClick={() => void navigator.clipboard?.writeText(CLAUDE_EXPORT_PROMPT)}>
                Copier ce message
              </Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xl font-semibold text-mist-100 tnum">{value}</div>
      <div className="text-[0.62rem] tracking-wide text-mist-500 uppercase">{label}</div>
    </div>
  )
}
