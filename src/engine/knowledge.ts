import type { KnowledgeFact, KnowledgeKind, KnowledgeNote } from '../types'

/* ──────────────────────────────────────────────────────────────────────────
   Base de connaissances : import du format « mémoire Claude », liens
   [[...]] façon Obsidian, recherche et classement par axe puis par type.
   Fonctions pures, sans React ni base de données.
   ────────────────────────────────────────────────────────────────────────── */

export interface AxeInfo {
  slug: string
  label: string
  color: string
  /** Direction de départ dans le cerveau 3D. */
  anchor: [number, number, number]
}

/* Aucun nom d'axe n'est codé en dur : les axes viennent de tes fiches. Couleur et position
   dans le cerveau sont attribuées dans l'ordre alphabétique des axes présents. */
const PALETTE = ['#35e3ff', '#ff8f45', '#41e08a', '#9b7bff', '#ffc24b', '#ff6fa8', '#8fb4ff', '#c8ef5a', '#27e0c0', '#e0a3ff', '#ffd9a0', '#7fd8ff']

function colorFor(i: number): string {
  if (i < PALETTE.length) return PALETTE[i]
  /* Au-delà : teintes réparties par l'angle d'or, pour rester distinctes. */
  return `hsl(${Math.round((i * 137.508) % 360)} 78% 64%)`
}

/** Répartition régulière sur une sphère (spirale de Fibonacci), aplatie comme un cerveau. */
function anchorFor(i: number, n: number): [number, number, number] {
  if (n <= 1) return [0.8, 0.3, 0.3]
  const y = 1 - ((i + 0.5) * 2) / n
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const t = i * 2.399963
  return [r * Math.cos(t) * 0.92, y * 0.72, r * Math.sin(t) * 0.92]
}

export const GENERAL_AXE: AxeInfo = { slug: '', label: 'Général', color: '#9fb6d6', anchor: [0, -0.1, 0.8] }

export function prettyAxe(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/** Axes présents dans les fiches, avec libellé (titre de la fiche « axe » si elle existe), couleur et position. */
export function axePalette(notes: KnowledgeNote[]): Map<string, AxeInfo> {
  const live = notes.filter((n) => !n.deleted)
  const slugs = [...new Set(live.map((n) => n.axe).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b))
  return new Map(
    slugs.map((slug, i) => [
      slug,
      {
        slug,
        label: live.find((n) => n.kind === 'hub' && n.axe === slug)?.title ?? prettyAxe(slug),
        color: colorFor(i),
        anchor: anchorFor(i, slugs.length),
      },
    ]),
  )
}

export function axeOf(palette: Map<string, AxeInfo>, slug: string | undefined): AxeInfo {
  if (!slug) return GENERAL_AXE
  return palette.get(slug) ?? { slug, label: prettyAxe(slug), color: GENERAL_AXE.color, anchor: GENERAL_AXE.anchor }
}

export const KIND_LABEL: Record<KnowledgeKind, string> = {
  profile: 'Profil',
  hub: 'Axe',
  area: 'Domaine',
  project: 'Projet',
  topic: 'Sujet',
  person: 'Personne',
  note: 'Note',
  doc: 'Document',
}

export const KIND_PLURAL: Record<KnowledgeKind, string> = {
  profile: 'Profil',
  hub: 'Axes',
  area: 'Domaines',
  project: 'Projets',
  topic: 'Sujets',
  person: 'Personnes',
  note: 'Notes',
  doc: 'Documents',
}

export const KIND_ORDER: KnowledgeKind[] = ['profile', 'hub', 'area', 'project', 'person', 'topic', 'note', 'doc']

const KINDS = new Set<string>(KIND_ORDER)

export const normTitle = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

export const slugify = (s: string) =>
  normTitle(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Identifiant stable dérivé du titre : un ré-import retrouve la même fiche. */
export function noteIdFor(title: string): string {
  return `kn_${slugify(title) || 'sans-titre'}`
}

/* ── Liens et tags ────────────────────────────────────────────────────── */

const WIKI = /\[\[([^\]\n]+?)\]\]/g

export function extractWikiLinks(text: string | undefined): string[] {
  if (!text) return []
  const out: string[] = []
  for (const m of text.matchAll(WIKI)) {
    /* [[Titre|texte affiché]] : on garde le titre. */
    const t = m[1].split('|')[0].trim()
    if (t && !out.some((x) => normTitle(x) === normTitle(t))) out.push(t)
  }
  return out
}

export function extractTags(text: string | undefined): string[] {
  if (!text) return []
  const out = new Set<string>()
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu)) out.add(m[1].toLowerCase())
  return [...out]
}

/* ── Import du format « mémoire Claude » ──────────────────────────────── */

export interface ParsedNote {
  title: string
  kind: KnowledgeKind
  axe?: string
  summary: string
  facts: KnowledgeFact[]
  links: string[]
}

export interface ParseResult {
  notes: ParsedNote[]
  warnings: string[]
}

const HEADER = /^(.+?)\s+\[([^\]\[]+)\]\s*[—–-]+\s*(.*)$/
const BULLET = /^\s*(?:[*•-])\s*(?:\((stated|verify|stated\?)\)\s*)?(.*)$/i

function cleanFact(raw: string): { text: string; links: string[] } {
  const links = extractWikiLinks(raw)
  const text = raw
    .replace(WIKI, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { text, links }
}

/**
 * Format attendu :
 *   Titre [type, axe nom-de-l-axe] — description courte
 *   * (stated) un fait
 *   * (verify) un doute à trancher [[Autre fiche]]
 * Les types : profile, hub, area, project, topic, person.
 */
export function parseClaudeMemory(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const warnings: string[] = []
  const byKey = new Map<string, ParsedNote>()
  let current: ParsedNote | null = null
  let lastFact: KnowledgeFact | null = null

  for (const [i, line] of lines.entries()) {
    if (!line.trim()) {
      lastFact = null
      continue
    }
    const isBullet = /^\s*[*•-]\s/.test(line)
    const h = !isBullet ? HEADER.exec(line.trim()) : null
    if (h) {
      const title = h[1].trim()
      const parts = h[2].split(',').map((p) => p.trim())
      let kind = parts[0].toLowerCase() as KnowledgeKind
      if (!KINDS.has(kind)) {
        warnings.push(`Ligne ${i + 1} : type « ${parts[0]} » inconnu pour « ${title} » (classé comme sujet).`)
        kind = 'topic'
      }
      const axePart = parts.find((p) => /^axe\s+/i.test(p))
      const axe = axePart ? axePart.replace(/^axe\s+/i, '').trim().toLowerCase() : undefined
      const summary = cleanFact(h[3])
      const key = normTitle(title)
      const existing = byKey.get(key)
      if (existing) {
        /* Même titre deux fois : on fusionne. */
        if (!existing.summary) existing.summary = summary.text
        for (const l of summary.links) if (!existing.links.includes(l)) existing.links.push(l)
        current = existing
      } else {
        current = { title, kind, axe, summary: summary.text, facts: [], links: summary.links }
        byKey.set(key, current)
      }
      lastFact = null
      continue
    }
    if (!current) {
      warnings.push(`Ligne ${i + 1} ignorée (avant la première fiche).`)
      continue
    }
    const b = isBullet ? BULLET.exec(line) : null
    if (b) {
      const status = /verify/i.test(b[1] ?? '') ? 'verify' : 'stated'
      const { text: t, links } = cleanFact(b[2])
      for (const l of links) if (!current.links.some((x) => normTitle(x) === normTitle(l))) current.links.push(l)
      if (t) {
        lastFact = { text: t, status }
        current.facts.push(lastFact)
      } else lastFact = null
      continue
    }
    /* Ligne de continuation d'un fait écrit sur plusieurs lignes. */
    if (lastFact) {
      const { text: t, links } = cleanFact(line)
      lastFact.text = `${lastFact.text} ${t}`.trim()
      for (const l of links) if (!current.links.some((x) => normTitle(x) === normTitle(l))) current.links.push(l)
    } else {
      warnings.push(`Ligne ${i + 1} ignorée : « ${line.trim().slice(0, 50)} ».`)
    }
  }
  return { notes: [...byKey.values()], warnings }
}

/* ── Format « plan » : rubriques et puces imbriquées ──────────────────── */

const BULLET_LINE = /^(\s*)[*•\-–]\s+(.*)$/
const MONTHS = /^(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/i
/** Mots trop généraux pour relier deux fiches juste parce qu'ils sont cités. */
const GENERIC = new Set(
  'sport business projets projet course voyage voyages études etudes famille identité identite programme programmes records objectifs stage boxe natation tractions pompes dips'.split(' '),
)

/** Titre d'une puce : le libellé avant « : », sinon le début de la phrase. */
export function splitBullet(raw: string): { title: string; rest: string } {
  const clean = raw.replace(/\*\*/g, '').trim()
  const colon = /^(.{2,70}?)\s*:\s+(.*)$/.exec(clean) ?? /^(.{2,70}?)\s*:\s*$/.exec(clean)
  if (colon && colon[1].split(/\s+/).length <= 9 && !/[.!?]/.test(colon[1])) {
    return { title: colon[1].trim(), rest: (colon[2] ?? '').trim() }
  }
  const clause = /^(.{8,60}?)(?:\.\s|,\s|\s[—–]\s|;\s)/.exec(clean)
  if (clause) return { title: clause[1].trim(), rest: clean }
  const words = clean.split(/\s+/)
  return { title: words.length > 8 ? `${words.slice(0, 7).join(' ')}…` : clean.replace(/[.\s]+$/, ''), rest: clean }
}

const isVerifyHeading = (h: string) => /contredit|verifier|vérifier/.test(normTitle(h))

export function parseOutline(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const warnings: string[] = []
  const notes: ParsedNote[] = []
  const used = new Map<string, number>()

  const uniqueTitle = (title: string, category: string) => {
    let t = title
    if (used.has(normTitle(t))) t = `${title} (${category})`
    let n = 2
    while (used.has(normTitle(t))) t = `${title} (${category} ${n++})`
    used.set(normTitle(t), 1)
    return t
  }

  let category: { title: string; slug: string; verify: boolean } | null = null
  let verifyNote: ParsedNote | null = null
  let indents: number[] = []
  let top: ParsedNote | null = null
  let child: ParsedNote | null = null

  const addLink = (a: ParsedNote, b: ParsedNote) => {
    if (!a.links.includes(b.title)) a.links.push(b.title)
    if (!b.links.includes(a.title)) b.links.push(a.title)
  }

  for (const [i, line] of lines.entries()) {
    if (!line.trim()) continue
    const b = BULLET_LINE.exec(line)
    if (!b) {
      /* Rubrique : une ligne courte sans puce. */
      const heading = line.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/[:：]\s*$/, '').trim()
      if (heading.length > 90 || /[.!?]$/.test(heading)) {
        warnings.push(`Ligne ${i + 1} ignorée : « ${heading.slice(0, 50)} ».`)
        continue
      }
      category = { title: heading, slug: slugify(heading), verify: isVerifyHeading(heading) }
      indents = []
      top = null
      child = null
      if (category.verify) {
        verifyNote = verifyNote ?? { title: 'À vérifier', kind: 'topic', axe: undefined, summary: 'Points à trancher', facts: [], links: [] }
        if (!notes.includes(verifyNote)) {
          used.set(normTitle(verifyNote.title), 1)
          notes.push(verifyNote)
        }
      } else {
        used.set(normTitle(heading), 1)
        notes.push({ title: heading, kind: 'hub', axe: category.slug, summary: '', facts: [], links: [] })
      }
      continue
    }
    if (!category) {
      warnings.push(`Ligne ${i + 1} ignorée (avant la première rubrique).`)
      continue
    }
    const indent = b[1].replace(/\t/g, '   ').length
    while (indents.length && indents[indents.length - 1] > indent) indents.pop()
    if (!indents.length || indents[indents.length - 1] < indent) indents.push(indent)
    const level = indents.length
    const text = b[2].trim()
    if (!text) continue

    if (category.verify && verifyNote) {
      verifyNote.facts.push({ text: text.replace(/\*\*/g, ''), status: 'verify' })
      continue
    }
    if (level === 1) {
      const { title, rest } = splitBullet(text)
      top = { title: uniqueTitle(title, category.title), kind: 'topic', axe: category.slug, summary: '', facts: rest ? [{ text: rest, status: 'stated' }] : [], links: [] }
      notes.push(top)
      child = null
    } else if (level === 2 && top) {
      const { title, rest } = splitBullet(text)
      child = { title: uniqueTitle(title, category.title), kind: 'topic', axe: category.slug, summary: '', facts: rest ? [{ text: rest, status: 'stated' }] : [], links: [] }
      notes.push(child)
      addLink(top, child)
    } else {
      /* Niveau 3 et plus : détail de la fiche du dessus. */
      const target = child ?? top
      if (target) target.facts.push({ text: text.replace(/\*\*/g, ''), status: 'stated' })
    }
  }
  /* Un titre court devient le résumé de sa fiche : première phrase du premier fait. */
  for (const n of notes) {
    if (!n.summary && n.facts.length && n.kind !== 'hub') {
      const f = n.facts[0].text
      n.summary = f.length > 110 ? `${f.slice(0, 107)}…` : f
    }
  }
  inferLinks(notes)
  return { notes, warnings }
}

/**
 * Relie les fiches qui se citent : si le texte d'une fiche mentionne le titre d'une autre
 * (nom propre ou expression distincte), on ajoute un lien. Prudent : pas de mot générique.
 */
export function inferLinks(notes: ParsedNote[], maxPerNote = 8): void {
  const targets = notes
    .filter((n) => n.kind !== 'hub' && n.title.length >= 4 && n.title.length <= 40)
    .filter((n) => /^\p{Lu}/u.test(n.title) && !MONTHS.test(n.title) && !/^\d/.test(n.title) && !GENERIC.has(normTitle(n.title)))
    .map((n) => ({ n, key: normTitle(n.title), re: new RegExp(`(^|[^a-z0-9])${normTitle(n.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`) }))
  for (const a of notes) {
    if (a.kind === 'hub') continue
    const hay = normTitle([a.summary, ...a.facts.map((f) => f.text)].join(' . '))
    let added = 0
    for (const t of targets) {
      if (t.n === a || added >= maxPerNote) continue
      if (t.re.test(hay) && !a.links.some((l) => normTitle(l) === t.key)) {
        a.links.push(t.n.title)
        added += 1
      }
    }
  }
}

/** Détecte le format : fiches `Titre [type, axe x] — …` ou plan à rubriques et puces. */
export function parseMemoryText(text: string): ParseResult & { format: 'fiches' | 'plan' } {
  const headers = text.split(/\r?\n/).filter((l) => !/^\s*[*•\-–]\s/.test(l) && HEADER.test(l.trim())).length
  if (headers > 0) return { ...parseClaudeMemory(text), format: 'fiches' }
  return { ...parseOutline(text), format: 'plan' }
}

/* ── Plan d'import : créer, mettre à jour, ou laisser tes modifications ── */

export interface ImportPlan {
  create: KnowledgeNote[]
  update: KnowledgeNote[]
  /** Fiches que tu as modifiées à la main : jamais écrasées. */
  kept: number
  unresolvedLinks: string[]
}

export function buildImportPlan(parsed: ParsedNote[], existing: KnowledgeNote[], now = new Date().toISOString()): ImportPlan {
  const byTitle = new Map(existing.filter((n) => !n.deleted).map((n) => [normTitle(n.title), n]))
  const create: KnowledgeNote[] = []
  const update: KnowledgeNote[] = []
  let kept = 0
  for (const p of parsed) {
    const prev = byTitle.get(normTitle(p.title))
    const base = {
      title: p.title,
      kind: p.kind,
      axe: p.axe,
      summary: p.summary || undefined,
      facts: p.facts,
      links: p.links,
      source: 'claude' as const,
    }
    if (!prev) {
      create.push({ id: noteIdFor(p.title), ...base, tags: [], createdAt: now, updatedAt: now })
    } else if (prev.source === 'manual' || prev.edited) {
      kept += 1
    } else {
      /* Import additif : on garde ce qui existe et on ajoute le nouveau, sans doublon. */
      const known = new Set(prev.facts.map((f) => normTitle(f.text)))
      const facts = [...prev.facts, ...p.facts.filter((f) => !known.has(normTitle(f.text)))]
      const links = [...prev.links]
      for (const l of p.links) if (!links.some((x) => normTitle(x) === normTitle(l))) links.push(l)
      update.push({
        ...prev,
        kind: prev.kind === 'topic' && p.kind !== 'topic' ? p.kind : prev.kind,
        axe: prev.axe ?? p.axe,
        summary: prev.summary ?? (p.summary || undefined),
        facts,
        links,
        updatedAt: now,
      })
    }
  }
  const all = new Set([...existing.filter((n) => !n.deleted).map((n) => normTitle(n.title)), ...parsed.map((p) => normTitle(p.title))])
  const unresolved = new Set<string>()
  for (const p of parsed) for (const l of p.links) if (!all.has(normTitle(l))) unresolved.add(l)
  return { create, update, kept, unresolvedLinks: [...unresolved] }
}

/* ── Liens entre fiches ───────────────────────────────────────────────── */

export function titleIndex(notes: KnowledgeNote[]): Map<string, KnowledgeNote> {
  return new Map(notes.filter((n) => !n.deleted).map((n) => [normTitle(n.title), n]))
}

export function resolveLinks(note: KnowledgeNote, index: Map<string, KnowledgeNote>) {
  const found: KnowledgeNote[] = []
  const missing: string[] = []
  for (const l of note.links) {
    const t = index.get(normTitle(l))
    if (t && t.id !== note.id) {
      if (!found.some((f) => f.id === t.id)) found.push(t)
    } else if (!t) missing.push(l)
  }
  return { found, missing }
}

export function backlinks(note: KnowledgeNote, notes: KnowledgeNote[]): KnowledgeNote[] {
  const me = normTitle(note.title)
  return notes
    .filter((n) => !n.deleted && n.id !== note.id && n.links.some((l) => normTitle(l) === me))
    .sort((a, b) => a.title.localeCompare(b.title))
}

/* ── Recherche ────────────────────────────────────────────────────────── */

export function searchNotes(notes: KnowledgeNote[], query: string): KnowledgeNote[] {
  const tokens = normTitle(query).split(' ').filter((t) => t.length >= 2)
  if (!tokens.length) return []
  const scored: { note: KnowledgeNote; score: number }[] = []
  for (const note of notes) {
    if (note.deleted) continue
    const title = normTitle(note.title)
    const summary = normTitle(note.summary ?? '')
    const body = normTitle(note.body ?? '')
    const tags = note.tags.map(normTitle)
    let score = 0
    let all = true
    for (const t of tokens) {
      let s = 0
      if (title.includes(t)) s += title.startsWith(t) ? 8 : 5
      if (tags.some((x) => x.includes(t))) s += 3
      if (summary.includes(t)) s += 2
      if (body.includes(t)) s += 1
      let factHits = 0
      for (const f of note.facts) if (normTitle(f.text).includes(t)) factHits += 1
      s += Math.min(3, factHits)
      if (!s) all = false
      score += s
    }
    if (all && score > 0) scored.push({ note, score })
  }
  return scored.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title)).map((x) => x.note)
}

/** Extrait d'un fait qui contient la recherche, pour l'afficher sous le titre. */
export function matchingFact(note: KnowledgeNote, query: string): string | null {
  const tokens = normTitle(query).split(' ').filter((t) => t.length >= 2)
  for (const f of note.facts) {
    const n = normTitle(f.text)
    if (tokens.every((t) => n.includes(t))) return f.text
  }
  for (const f of note.facts) {
    const n = normTitle(f.text)
    if (tokens.some((t) => n.includes(t))) return f.text
  }
  return null
}

/* ── Classement : par axe, puis par type, puis par titre ──────────────── */

export interface NoteGroup {
  axe: AxeInfo
  count: number
  kinds: { kind: KnowledgeKind; notes: KnowledgeNote[] }[]
}

export function groupNotes(notes: KnowledgeNote[]): NoteGroup[] {
  const live = notes.filter((n) => !n.deleted)
  const palette = axePalette(live)
  const slugs = [...new Set(live.map((n) => n.axe ?? ''))]
  return slugs
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
    .map((slug) => {
      const inAxe = live.filter((n) => (n.axe ?? '') === slug)
      const kinds = KIND_ORDER.map((kind) => ({
        kind,
        notes: inAxe.filter((n) => n.kind === kind).sort((a, b) => a.title.localeCompare(b.title, 'fr')),
      })).filter((k) => k.notes.length)
      return {
        axe: axeOf(palette, slug),
        count: inAxe.length,
        kinds,
      }
    })
}

/** Les doutes à trancher, toutes fiches confondues. */
export function verifyItems(notes: KnowledgeNote[]): { note: KnowledgeNote; fact: KnowledgeFact }[] {
  const out: { note: KnowledgeNote; fact: KnowledgeFact }[] = []
  for (const note of notes) {
    if (note.deleted) continue
    for (const fact of note.facts) if (fact.status === 'verify') out.push({ note, fact })
  }
  return out
}

/* ── Édition : faits en lignes de texte (« ? » devant un doute) ────────── */

export function factsToText(facts: KnowledgeFact[]): string {
  return facts.map((f) => (f.status === 'verify' ? `? ${f.text}` : f.text)).join('\n')
}

export function textToFacts(text: string): KnowledgeFact[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('?') ? { text: l.replace(/^\?\s*/, ''), status: 'verify' as const } : { text: l, status: 'stated' as const }))
}

/** Modèle de requête à donner à Claude pour obtenir un export dans ce format. */
export const CLAUDE_EXPORT_PROMPT = `Écris tout ce que tu sais de moi sous forme de fiches, une par sujet, dans ce format exact, sans rien ajouter d'autre :

Titre [type, axe nom-de-l-axe] — description courte
* (stated) un fait précis
* (verify) un doute ou une incohérence à trancher [[Autre fiche]]

Types possibles : profile (moi), hub (un grand axe de vie), area (un domaine), project, topic, person.
Pour l'axe, utilise un mot court en minuscules sans espace (ex. sport, entrepreneuriat). Mets des [[liens]] vers les titres d'autres fiches quand c'est pertinent.`
