import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { parseDocumentXml, readDocx } from './docx'

const XML = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>X1  Titre</w:t></w:r><w:r><w:t xml:space="preserve">    60 min &amp; plus</w:t></w:r></w:p>
<w:tbl><w:tblPr/><w:tr><w:trPr/><w:tc><w:tcPr/><w:p><w:r><w:t>Semaine</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>A. Bloc</w:t></w:r></w:p><w:p><w:r><w:t>repos 3:00</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>S1  5-11 janv</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>5 x 6</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
</w:body></w:document>`

/** Petit zip valide (une entrée compressée) fabriqué à la main. */
function zip(name: string, content: string): Uint8Array {
  const data = deflateRawSync(Buffer.from(content))
  const nm = Buffer.from(name)
  const le16 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255])
  const le32 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255])
  const local = Buffer.concat([le32(0x04034b50), le16(20), le16(0), le16(8), le16(0), le16(0), le32(0), le32(data.length), le32(content.length), le16(nm.length), le16(0), nm, data])
  const central = Buffer.concat([le32(0x02014b50), le16(20), le16(20), le16(0), le16(8), le16(0), le16(0), le32(0), le32(data.length), le32(content.length), le16(nm.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(0), nm])
  const end = Buffer.concat([le32(0x06054b50), le16(0), le16(0), le16(1), le16(1), le32(central.length), le32(local.length), le16(0)])
  return new Uint8Array(Buffer.concat([local, central, end]))
}

describe('lecture d’un document Word', () => {
  it('lit paragraphes et tableaux', () => {
    const blocks = parseDocumentXml(XML)
    expect(blocks[0]).toEqual({ type: 'p', text: 'X1  Titre    60 min & plus' })
    expect(blocks[1]).toEqual({
      type: 'table',
      rows: [
        ['Semaine', 'A. Bloc\nrepos 3:00'],
        ['S1  5-11 janv', '5 x 6'],
      ],
    })
  })
  it('lit un fichier dans un zip compressé', async () => {
    const z = zip('word/document.xml', XML)
    const blocks = await readDocx(new Blob([z as BlobPart]))
    expect(blocks).toHaveLength(2)
  })
  it('refuse un fichier qui n’est pas un zip', async () => {
    await expect(readDocx(new Blob(['pas un zip du tout, juste du texte']))).rejects.toThrow()
  })
})
