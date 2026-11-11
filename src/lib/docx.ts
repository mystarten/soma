import type { DocBlock } from '../engine/program'
import { readZip } from './unzip'

/* ──────────────────────────────────────────────────────────────────────────
   Lecture d'un fichier Word (.docx) directement dans le navigateur, sans envoi
   nulle part : un .docx est un zip ; on y lit word/document.xml (paragraphes et
   tableaux) avec le lecteur zip maison (unzip.ts).
   ────────────────────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

/** Le texte d'un morceau de XML Word : runs `w:t`, tabulations et sauts de ligne. */
function paragraphText(xml: string): string {
  let out = ''
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) out += decode(m[1])
    else if (m[0].startsWith('<w:tab')) out += '    '
    else out += '\n'
  }
  return out
}

/** Paragraphes (séparés par des sauts de ligne) d'une cellule. */
function cellText(xml: string): string {
  const paras = xml.split(/<\/w:p>/).map(paragraphText)
  return paras
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n')
}

/** `word/document.xml` → paragraphes et tableaux (les tableaux imbriqués sont ignorés). */
export function parseDocumentXml(xml: string): DocBlock[] {
  const body = xml.slice(xml.indexOf('<w:body'))
  const blocks: DocBlock[] = []
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const chunk = m[0]
    if (chunk.startsWith('<w:tbl>')) {
      const rows: string[][] = []
      for (const tr of chunk.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        rows.push((tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(cellText))
      }
      blocks.push({ type: 'table', rows })
    } else {
      blocks.push({ type: 'p', text: paragraphText(chunk) })
    }
  }
  return blocks
}

/** Un fichier .docx choisi par l'utilisateur → contenu structuré. */
export async function readDocx(file: Blob): Promise<DocBlock[]> {
  const entries = await readZip(await file.arrayBuffer())
  const doc = entries.find((e) => e.name === 'word/document.xml')
  if (!doc) throw new Error('Ce fichier n’est pas un document Word (.docx) valide.')
  return parseDocumentXml(await doc.text())
}
