import type { Program, ProgramBlock, ProgramSession, ProgramWeek, Prescription } from '../types'
import { describePrescription, normalizePrescription, prescriptionToJson } from './prescription'
import { plannedWeeks } from './program'

/* Format JSON d'un programme : fait pour qu'une IA (Claude…) puisse l'écrire sans ambiguïté, et pour être relu par l'appli. */

export const PROGRAM_FORMAT = 'soma-programme'
export const PROGRAM_VERSION = 1

export interface JsonResult {
  program?: { name: string; sessions: ProgramSession[] }
  errors: string[]
  warnings: string[]
}

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)

/** Lit un programme JSON et le convertit. Les erreurs sont écrites en français, avec l'endroit exact. */
export function programFromJson(input: unknown): JsonResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!isObj(input)) return { errors: ['Le JSON doit être un objet { "format": "soma-programme", "sessions": [...] }.'], warnings }
  if (input.format !== undefined && input.format !== PROGRAM_FORMAT) errors.push(`« format » doit valoir "${PROGRAM_FORMAT}".`)
  const rawSessions = input.sessions
  if (!Array.isArray(rawSessions) || !rawSessions.length) return { errors: [...errors, '« sessions » doit être une liste d’au moins une séance.'], warnings }

  /* Semaines communes à toutes les séances. */
  let weeks: ProgramWeek[] = []
  if (Array.isArray(input.weeks)) {
    weeks = (input.weeks as unknown[]).map((w, i) => {
      const o = isObj(w) ? w : {}
      const n = typeof o.n === 'number' ? o.n : i + 1
      return {
        n,
        label: typeof o.label === 'string' ? o.label : '',
        startDay: typeof o.start === 'string' ? o.start : undefined,
        endDay: typeof o.end === 'string' ? o.end : undefined,
        light: o.light === true || undefined,
        test: o.test === true || undefined,
      }
    })
  }
  if (!weeks.length) {
    const longest = Math.max(1, ...rawSessions.flatMap((s) => (isObj(s) && Array.isArray(s.blocks) ? (s.blocks as unknown[]).map((b) => (isObj(b) && Array.isArray(b.weeks) ? b.weeks.length : 0)) : [0])))
    weeks = Array.from({ length: longest }, (_, i) => ({ n: i + 1, label: '' }))
    warnings.push('« weeks » absent : les semaines sont numérotées automatiquement.')
  }

  const codes = new Set<string>()
  const sessions: ProgramSession[] = []
  rawSessions.forEach((rs, si) => {
    const where = `Séance n°${si + 1}`
    if (!isObj(rs)) return void errors.push(`${where} : doit être un objet.`)
    const code = typeof rs.code === 'string' ? rs.code.trim().toUpperCase() : ''
    if (!/^[A-Z][A-Z0-9]{0,5}$/.test(code)) return void errors.push(`${where} : le champ « code » est invalide (ex. "T1", "J2", "A1", "C1" : T/M/P = street workout, J = jambes, A = abdos, C = course).`)
    if (codes.has(code)) return void errors.push(`${where} : le code ${code} est utilisé deux fois.`)
    codes.add(code)
    const title = typeof rs.title === 'string' && rs.title.trim() ? rs.title.trim() : code
    if (!Array.isArray(rs.blocks) || !rs.blocks.length) return void errors.push(`Séance ${code} : le champ « blocks » doit lister au moins un exercice.`)
    const blocks: ProgramBlock[] = []
    ;(rs.blocks as unknown[]).forEach((rb, bi) => {
      const bw = `Séance ${code} › bloc ${bi + 1}`
      if (!isObj(rb)) return void errors.push(`${bw} : doit être un objet.`)
      const name = typeof rb.name === 'string' && rb.name.trim() ? rb.name.trim() : ''
      if (!name) return void errors.push(`${bw} : le champ « name » est manquant.`)
      if (rb.weeks !== undefined && !Array.isArray(rb.weeks)) return void errors.push(`${bw} (« ${name} ») : le champ « weeks » doit être une liste (une entrée par semaine).`)
      const rawWeeks = Array.isArray(rb.weeks) ? rb.weeks : []
      if (rawWeeks.length > weeks.length) warnings.push(`${code} › ${name} : ${rawWeeks.length} semaines données pour ${weeks.length} semaines déclarées (les extras sont ignorées).`)
      if (rawWeeks.length < weeks.length) warnings.push(`${code} › ${name} : ${rawWeeks.length} semaines données pour ${weeks.length} : les suivantes sont en repos.`)
      const cells: string[] = []
      const plans: (Prescription | null)[] = []
      weeks.forEach((_, wi) => {
        const r = normalizePrescription(rawWeeks[wi])
        if (r !== null && typeof r === 'object' && 'error' in r) {
          errors.push(`${code} › ${name} › semaine ${wi + 1} : ${r.error}.`)
          cells.push('')
          plans.push(null)
        } else if (typeof r === 'string') {
          cells.push(r)
          plans.push(null)
        } else if (r === null) {
          cells.push('')
          plans.push(null)
        } else {
          cells.push(describePrescription(r))
          plans.push(r)
        }
      })
      const restSec = typeof rb.rest_sec === 'number' ? rb.rest_sec : typeof rb.restSec === 'number' ? rb.restSec : undefined
      blocks.push({
        name,
        exercise: typeof rb.exercise === 'string' && rb.exercise.trim() ? rb.exercise.trim() : undefined,
        note: typeof rb.note === 'string' ? rb.note : undefined,
        restSec,
        cells,
        plans: plans.some(Boolean) ? plans : undefined,
      })
    })
    sessions.push({
      code,
      title,
      meta: typeof rs.meta === 'string' ? rs.meta : undefined,
      durationMin: typeof rs.duration_min === 'number' ? rs.duration_min : undefined,
      weeks: weeks.map((w) => ({ ...w })),
      blocks,
    })
  })
  for (const s of sessions) if (!plannedWeeks(s).length) warnings.push(`Séance ${s.code} : aucune semaine n’a de contenu, elle n’apparaîtra jamais.`)
  if (errors.length) return { errors, warnings }
  return { program: { name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Mon programme', sessions }, errors, warnings }
}

/** Le programme actuel au format JSON (export, contexte pour l'IA). */
export function programToJson(program: Pick<Program, 'sessions'> & { name?: string }): unknown {
  const weeks = program.sessions[0]?.weeks ?? []
  return {
    format: PROGRAM_FORMAT,
    version: PROGRAM_VERSION,
    name: program.name ?? 'Mon programme',
    weeks: weeks.map((w) => ({ n: w.n, label: w.label, ...(w.startDay ? { start: w.startDay } : {}), ...(w.endDay ? { end: w.endDay } : {}), ...(w.light ? { light: true } : {}), ...(w.test ? { test: true } : {}) })),
    sessions: program.sessions.map((s) => ({
      code: s.code,
      title: s.title,
      ...(s.durationMin ? { duration_min: s.durationMin } : {}),
      blocks: s.blocks.map((b) => ({
        name: b.name,
        ...(b.exercise ? { exercise: b.exercise } : {}),
        ...(b.restSec !== undefined ? { rest_sec: b.restSec } : {}),
        ...(b.note ? { note: b.note } : {}),
        weeks: b.cells.map((c, i) => (b.plans?.[i] ? prescriptionToJson(b.plans[i] as Prescription) : c.trim() ? c : null)),
      })),
    })),
  }
}

/** Texte à donner à Claude : le format, les règles et un exemple complet. */
export const PROGRAM_FORMAT_DOC = `Tu vas écrire un programme d'entraînement au format JSON pour l'application Soma. Réponds UNIQUEMENT avec le JSON (dans un bloc de code), sans commentaire.

STRUCTURE
{
  "format": "soma-programme",
  "version": 1,
  "name": "Nom du programme",
  "weeks": [ { "n": 1, "label": "12-18 oct", "light": false, "test": false }, ... ],   // une entrée par semaine ; "light": true = semaine de décharge ; "test": true = semaine de test
  "sessions": [
    {
      "code": "T1",                      // T, M ou P = street workout · J = jambes · A = abdos · C = course à pied
      "title": "Tirage lesté force-endurance",
      "duration_min": 70,
      "blocks": [                        // les exercices de la séance, dans l'ordre
        {
          "name": "Tractions lestées",   // nom affiché ; "exercise" (facultatif) aide à retrouver la bonne fiche
          "rest_sec": 180,               // repos APRÈS chaque série de ce bloc (secondes)
          "note": "il te reste 2 reps",
          "weeks": [ <une prescription par semaine, dans l'ordre de "weeks"> ]
        }
      ]
    }
  ]
}

PRESCRIPTIONS (une par semaine ; null = rien à faire cette semaine)
- Séries identiques : { "sets": 5, "reps": 6, "load_kg": 25 }   (load_kg facultatif ; le repos vient de "rest_sec" du bloc, ou ajoute "rest_sec" ici)
- Tenue : { "sets": 3, "hold_sec": 30 }   (planche, L-sit… ; un exercice fait d'un seul côté, ex. planche latérale, est compté des deux côtés automatiquement)
- Séries différentes : { "series": [ { "reps": 60 }, { "reps": 55 }, { "reps": 50, "load_kg": 10 } ] }
- Pyramide à deux exercices enchaînés (pas de repos entre les deux, repos après chaque paire) :
  { "pyramid": { "steps": [5,10,15,22,15,10,5], "first": "Tractions", "second": "Pompes", "second_ratio": 2, "rest_between_pairs_sec": 90 } }
  → 5 tractions puis 10 pompes, repos 90 s, 10 tractions puis 20 pompes, etc.
- EMOM (un chrono d'une minute, on fait les répétitions au début de chaque minute) :
  { "emom": { "minutes": 18, "minute_items": [ { "exercise": "Tractions", "reps": 11 }, { "exercise": "Pompes", "reps": 20 } ] } }
  → minutes impaires : tractions, minutes paires : pompes. Avec un seul élément dans "minute_items", c'est le même exercice à chaque minute.
- Distance en tours (rameur, course) : { "rounds": 10, "distance_m": 330, "pace_sec_per_500m": 108 }
- Test : { "test": "max de tractions" }
- Course à pied (code C1…) : du texte, affiché tel quel, avec un chrono trot/marche : "5 x (3' trot + 1' marche)", "30' continu"
- Du texte libre reste accepté pour des cas simples : "4 x 8 +20 kg"

RÈGLES
- Toujours donner les temps de repos exacts (rest_sec) et les répétitions exactes de chaque semaine : ne laisse rien d'implicite.
- Le nombre d'entrées de "weeks" de chaque bloc doit être égal au nombre de semaines de "weeks".
- Un code de séance est unique.

EXEMPLE
{
  "format": "soma-programme", "version": 1, "name": "Exemple 3 semaines",
  "weeks": [ { "n": 1, "label": "S1" }, { "n": 2, "label": "S2" }, { "n": 3, "label": "S3 décharge", "light": true } ],
  "sessions": [
    {
      "code": "M1", "title": "Endurance mixte tractions + pompes", "duration_min": 60,
      "blocks": [
        { "name": "A. Pyramide", "rest_sec": 90,
          "weeks": [
            { "pyramid": { "steps": [5,10,15,10,5], "first": "Tractions", "second": "Pompes", "second_ratio": 2, "rest_between_pairs_sec": 90 } },
            { "pyramid": { "steps": [5,10,15,20,15,10,5], "first": "Tractions", "second": "Pompes", "second_ratio": 2, "rest_between_pairs_sec": 90 } },
            { "pyramid": { "steps": [5,10,5], "first": "Tractions", "second": "Pompes", "second_ratio": 2, "rest_between_pairs_sec": 90 } } ] },
        { "name": "B. EMOM", "rest_sec": 0,
          "weeks": [
            { "emom": { "minutes": 12, "minute_items": [ { "exercise": "Tractions", "reps": 9 }, { "exercise": "Pompes", "reps": 18 } ] } },
            { "emom": { "minutes": 14, "minute_items": [ { "exercise": "Tractions", "reps": 9 }, { "exercise": "Pompes", "reps": 20 } ] } },
            { "emom": { "minutes": 8, "minute_items": [ { "exercise": "Tractions", "reps": 8 }, { "exercise": "Pompes", "reps": 15 } ] } } ] },
        { "name": "C. Planche latérale", "rest_sec": 60,
          "weeks": [ { "sets": 3, "hold_sec": 30 }, { "sets": 3, "hold_sec": 35 }, { "sets": 2, "hold_sec": 30 } ] }
      ]
    }
  ]
}`

/** Explique une erreur de syntaxe JSON : ligne, colonne et extrait. */
export function explainJsonSyntaxError(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lc = /line (\d+) column (\d+)/.exec(msg)
  let line: number | undefined
  let col: number | undefined
  if (lc) {
    line = Number(lc[1])
    col = Number(lc[2])
  } else {
    let at: number | undefined
    const pos = /position (\d+)/.exec(msg)
    if (pos) at = Number(pos[1])
    else {
      /* Chrome et Safari ne donnent pas la position, seulement un extrait autour de la faute : on le retrouve dans le texte. */
      const snip = /"(?:\.\.\.)?([\s\S]*?)(?:\.\.\.)?" is not valid JSON/.exec(msg)?.[1]
      const idx = snip ? text.indexOf(snip) : -1
      if (snip && idx >= 0) at = idx + Math.floor(snip.length / 2)
    }
    if (at !== undefined) {
      const before = text.slice(0, at)
      line = before.split('\n').length
      col = before.length - before.lastIndexOf('\n')
    }
  }
  const lines = text.split('\n')
  const excerpt = line ? (lines[line - 1] ?? '').trim().slice(0, 80) : ''
  return line ? `JSON invalide ligne ${line}, colonne ${col}${excerpt ? ` : « ${excerpt} »` : ''}. Vérifie les virgules, les guillemets et les accolades.` : `JSON invalide (${msg}). Colle uniquement le bloc JSON complet.`
}
