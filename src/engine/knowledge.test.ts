import { describe, expect, it } from 'vitest'
import type { KnowledgeNote } from '../types'
import {
  axeOf,
  axePalette,
  backlinks,
  buildImportPlan,
  extractTags,
  extractWikiLinks,
  factsToText,
  groupNotes,
  matchingFact,
  noteIdFor,
  parseClaudeMemory,
  parseMemoryText,
  resolveLinks,
  searchNotes,
  textToFacts,
  titleIndex,
  verifyItems,
} from './knowledge'

/* Données entièrement fictives, au format de l'export. */
const SAMPLE = `Camille Test [profile] — Camille Test, 30 ans. Cuisinière et marathonienne amateur

* (stated) Nom : Camille Test
* (stated) Aime les voyages

Cuisine [hub, axe cuisine] — Tout ce qui touche à la cuisine

* (stated) Cuisine tous les jours

Pâtisserie [area, axe cuisine] — Desserts de fête

* (stated) Spécialité : tarte au citron [[Recettes été]]

Recettes été [topic, axe cuisine] — Fiches de saison

* (stated) Salade grecque
* (stated) Gaspacho, servi très froid
  et mixé finement

Course · Marathon 2027 [project, axe course] — Objectif : finir en moins de 4 h

* (stated) Séance clé : 3 x 2 km à 5:10/km [[Pâtisserie]] [[Course à pied]]
* (verify) Record du 10 km : 48 min ou 51 min ? [[Course à pied]]

Course à pied [topic, axe course] — Volume et allures

* (stated) 3 séances par semaine

Inconnu [rien, axe cuisine] — Type inconnu

* (stated) Un fait

Ligne perdue avant tout

Cuisine [hub, axe cuisine] — Doublon du même titre

* (stated) Un second fait sur la cuisine

Sans axe [note] — Une fiche sans axe

* (stated) Rien de plus
`

describe('import du format mémoire', () => {
  const r = parseClaudeMemory(SAMPLE)
  const by = (t: string) => r.notes.find((n) => n.title === t)!

  it('lit titre, type, axe et description', () => {
    expect(by('Camille Test')).toMatchObject({ kind: 'profile', axe: undefined })
    expect(by('Cuisine')).toMatchObject({ kind: 'hub', axe: 'cuisine', summary: 'Tout ce qui touche à la cuisine' })
    expect(by('Course · Marathon 2027')).toMatchObject({ kind: 'project', axe: 'course' })
  })

  it('sépare les faits sûrs des doutes à trancher', () => {
    const m = by('Course · Marathon 2027')
    expect(m.facts.map((f) => f.status)).toEqual(['stated', 'verify'])
    expect(m.facts[1].text).toBe('Record du 10 km : 48 min ou 51 min ?')
  })

  it('extrait les liens [[...]] et les retire du texte affiché', () => {
    const m = by('Course · Marathon 2027')
    expect(m.links).toEqual(['Pâtisserie', 'Course à pied'])
    expect(m.facts[0].text).toBe('Séance clé : 3 x 2 km à 5:10/km')
    expect(by('Pâtisserie').links).toEqual(['Recettes été'])
  })

  it('recolle un fait écrit sur plusieurs lignes', () => {
    expect(by('Recettes été').facts[1].text).toBe('Gaspacho, servi très froid et mixé finement')
  })

  it('fusionne deux fiches de même titre', () => {
    expect(r.notes.filter((n) => n.title === 'Cuisine')).toHaveLength(1)
    expect(by('Cuisine').facts.map((f) => f.text)).toEqual(['Cuisine tous les jours', 'Un second fait sur la cuisine'])
  })

  it('signale sans planter : type inconnu et ligne orpheline', () => {
    expect(by('Inconnu').kind).toBe('topic')
    expect(r.warnings.some((w) => /inconnu/.test(w))).toBe(true)
    expect(r.warnings.some((w) => /Ligne perdue/.test(w))).toBe(true)
    expect(r.notes).toHaveLength(8)
  })

  it('tolère les fins de ligne Windows et les puces variées', () => {
    const p = parseClaudeMemory('A [topic, axe x] — d\r\n- (stated) un\r\n• (verify) deux\r\n* trois\r\n')
    expect(p.notes[0].facts).toEqual([
      { text: 'un', status: 'stated' },
      { text: 'deux', status: 'verify' },
      { text: 'trois', status: 'stated' },
    ])
  })
})

describe('plan d’import', () => {
  const parsed = parseClaudeMemory(SAMPLE).notes

  it('crée tout la première fois, avec des identifiants stables', () => {
    const plan = buildImportPlan(parsed, [])
    expect(plan.create).toHaveLength(8)
    expect(plan.update).toHaveLength(0)
    expect(plan.create.find((n) => n.title === 'Course · Marathon 2027')!.id).toBe('kn_course-marathon-2027')
    expect(noteIdFor('Été — Été !')).toBe('kn_ete-ete')
  })

  it('un ré-import met à jour sans créer de doublon', () => {
    const first = buildImportPlan(parsed, []).create
    const plan = buildImportPlan(parsed, first)
    expect(plan.create).toHaveLength(0)
    expect(plan.update).toHaveLength(8)
  })

  it('ne touche jamais à une fiche modifiée à la main', () => {
    const first = buildImportPlan(parsed, []).create.map((n) => (n.title === 'Cuisine' ? { ...n, edited: true } : n))
    const plan = buildImportPlan(parsed, first)
    expect(plan.kept).toBe(1)
    expect(plan.update.map((n) => n.title)).not.toContain('Cuisine')
  })

  it('repère les liens vers des fiches qui n’existent pas', () => {
    const plan = buildImportPlan(parseClaudeMemory('A [topic, axe x] — d\n* (stated) f [[Absente]] [[A]]').notes, [])
    expect(plan.unresolvedLinks).toEqual(['Absente'])
  })
})

describe('liens, recherche et classement', () => {
  const notes: KnowledgeNote[] = buildImportPlan(parseClaudeMemory(SAMPLE).notes, []).create
  const idx = titleIndex(notes)
  const note = (t: string) => notes.find((n) => n.title === t)!

  it('résout les liens, ignore les accents, et trouve les citations en retour', () => {
    const { found, missing } = resolveLinks(note('Course · Marathon 2027'), idx)
    expect(found.map((n) => n.title)).toEqual(['Pâtisserie', 'Course à pied'])
    expect(missing).toEqual([])
    expect(backlinks(note('Course à pied'), notes).map((n) => n.title)).toEqual(['Course · Marathon 2027'])
    expect(extractWikiLinks('voir [[Course à pied|la course]] et [[course a pied]]')).toEqual(['Course à pied'])
    expect(extractTags('un #Sport et #voyage-2026, mais pas a#b')).toEqual(['sport', 'voyage-2026'])
  })

  it('cherche dans les titres, les faits et sans tenir compte des accents', () => {
    expect(searchNotes(notes, 'patisserie')[0].title).toBe('Pâtisserie')
    expect(searchNotes(notes, 'gaspacho').map((n) => n.title)).toEqual(['Recettes été'])
    expect(searchNotes(notes, 'marathon 4 h').length).toBeGreaterThanOrEqual(0)
    expect(searchNotes(notes, 'zzzz')).toEqual([])
    expect(searchNotes(notes, 'a')).toEqual([])
    expect(matchingFact(note('Recettes été'), 'gaspacho')).toContain('Gaspacho')
  })

  it('classe par axe puis par type, axes connus d’abord', () => {
    const groups = groupNotes(notes)
    expect(groups.map((g) => g.axe.slug)).toEqual(['course', 'cuisine', ''])
    const cuisine = groups[1]
    expect(cuisine.kinds.map((k) => k.kind)).toEqual(['hub', 'area', 'topic'])
    expect(groups[2].axe.label).toBe('Général')
    expect(groupNotes([{ ...notes[0], axe: 'zeta' }, { ...notes[1], axe: 'alpha' }]).map((g) => g.axe.slug)).toEqual(['alpha', 'zeta'])
    /* libellé = titre de la fiche « axe » ; sinon l'identifiant mis en forme */
    const pal = axePalette(notes)
    expect(axeOf(pal, 'cuisine').label).toBe('Cuisine')
    expect(axeOf(pal, 'mon-axe-perso').label).toBe('Mon axe perso')
    expect(new Set([...pal.values()].map((a) => a.color)).size).toBe(pal.size)
  })

  it('liste les doutes à trancher', () => {
    const v = verifyItems(notes)
    expect(v).toHaveLength(1)
    expect(v[0].note.title).toBe('Course · Marathon 2027')
  })

  it('aller-retour de l’édition des faits', () => {
    const facts = [
      { text: 'sûr', status: 'stated' as const },
      { text: 'douteux', status: 'verify' as const },
    ]
    expect(factsToText(facts)).toBe('sûr\n? douteux')
    expect(textToFacts('sûr\n\n? douteux\n')).toEqual(facts)
  })
})

describe('parseMemoryText — plan à puces', () => {
  const PLAN = `Famille et proches
- Parents
  - Maman
  - Papa
- Fratrie

Sport
- Records
  - 5 km en 25 min
  - Développé couché 80 kg
- Programmes

Points où le cerveau se contredit (« À vérifier »)
- Poids 70 ou 72 kg ?
`
  it('détecte le format plan et crée un neurone par rubrique et sous-rubrique', () => {
    const r = parseMemoryText(PLAN)
    expect(r.format).toBe('plan')
    const titles = r.notes.map((n) => n.title)
    for (const t of ['Famille et proches', 'Parents', 'Maman', 'Papa', 'Fratrie', 'Sport', 'Records', 'Programmes']) {
      expect(titles).toContain(t)
    }
    const parents = r.notes.find((n) => n.title === 'Parents')!
    expect(parents.links).toContain('Maman')
  })
  it('range les contradictions dans une fiche À vérifier', () => {
    const r = parseMemoryText(PLAN)
    const v = r.notes.find((n) => /vérifier/i.test(n.title))!
    expect(v.facts.some((f) => f.status === 'verify')).toBe(true)
  })
  it('garde le format fiches quand il y a des en-têtes [type, axe]', () => {
    expect(parseMemoryText('A [topic, axe x] — d\n* (stated) un').format).toBe('fiches')
  })
})
