/* ──────────────────────────────────────────────────────────────────────────
   Lecteur ZIP minimal, 100 % navigateur, sans dépendance :
   – « stored » (méthode 0) lu tel quel
   – « deflate » (méthode 8) décompressé via DecompressionStream('deflate-raw')
   Utilisé pour accepter directement le zip d'export WHOOP.
   ────────────────────────────────────────────────────────────────────────── */

export interface ZipEntry {
  name: string
  text: () => Promise<string>
}

const SIG_EOCD = 0x06054b50
const SIG_CD = 0x02014b50
const SIG_LOCAL = 0x04034b50

export function looksLikeZip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 4) return false
  return new DataView(buffer).getUint32(0, true) === SIG_LOCAL
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Décompression zip non prise en charge par ce navigateur.')
  }
  const stream = new Blob([data as unknown as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

export async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  /* Fin du central directory : on cherche la signature depuis la fin. */
  let eocd = -1
  const start = Math.max(0, buffer.byteLength - 66_000)
  for (let i = buffer.byteLength - 22; i >= start; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Archive zip illisible.')

  const count = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder('utf-8')
  const entries: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== SIG_CD) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLen = view.getUint16(offset + 28, true)
    const extraLen = view.getUint16(offset + 30, true)
    const commentLen = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen))
    offset += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue

    entries.push({
      name,
      text: async () => {
        if (view.getUint32(localOffset, true) !== SIG_LOCAL) {
          throw new Error(`Entrée zip corrompue : ${name}`)
        }
        const lNameLen = view.getUint16(localOffset + 26, true)
        const lExtraLen = view.getUint16(localOffset + 28, true)
        const dataStart = localOffset + 30 + lNameLen + lExtraLen
        const raw = bytes.subarray(dataStart, dataStart + compressedSize)
        const out = method === 0 ? raw : await inflateRaw(raw)
        return decoder.decode(out)
      },
    })
  }
  return entries
}
