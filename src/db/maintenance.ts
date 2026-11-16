import { db } from './db'

/* Santé du stockage local : combien de place, ce qui en prend, et comment en libérer sans rien perdre. */

export interface StorageReport {
  usageMB: number | null
  quotaMB: number | null
  /** Part du quota utilisée, 0 → 1. */
  ratio: number | null
  persisted: boolean | null
  rows: { label: string; count: number }[]
  queue: number
  localStorageKB: number
}

const mb = (n: number) => Math.round((n / 1_048_576) * 10) / 10

export async function storageReport(): Promise<StorageReport> {
  let usage: number | null = null
  let quota: number | null = null
  let persisted: boolean | null = null
  try {
    const e = await navigator.storage?.estimate?.()
    usage = e?.usage ?? null
    quota = e?.quota ?? null
    persisted = (await navigator.storage?.persisted?.()) ?? null
  } catch {
    /* indisponible */
  }
  const count = async (t: { count: () => Promise<number> }) => {
    try {
      return await t.count()
    } catch {
      return 0
    }
  }
  const rows = [
    { label: 'Séances', count: await count(db.workouts) },
    { label: 'Jours (WHOOP et saisies)', count: await count(db.checkins) },
    { label: 'Fiches du Savoir', count: await count(db.notes) },
    { label: 'Tâches et échéances', count: (await count(db.tasks)) + (await count(db.deadlines)) },
  ]
  let ls = 0
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) ?? ''
      ls += k.length + (window.localStorage.getItem(k)?.length ?? 0)
    }
  } catch {
    /* indisponible */
  }
  return {
    usageMB: usage === null ? null : mb(usage),
    quotaMB: quota === null ? null : mb(quota),
    ratio: usage !== null && quota ? usage / quota : null,
    persisted,
    rows,
    queue: await count(db.syncQueue),
    localStorageKB: Math.round((ls * 2) / 1024),
  }
}

/** Libère de la place sans toucher aux données : file de synchro dédoublonnée, caches temporaires vidés. */
export async function freeSpace(): Promise<{ queueBefore: number; queueAfter: number; cacheCleared: boolean }> {
  const all = await db.syncQueue.orderBy('id').toArray()
  const last = new Map<string, number>()
  for (const op of all) last.set(`${op.table}|${op.rowId}`, op.id as number)
  const keep = new Set(last.values())
  const drop = all.filter((o) => !keep.has(o.id as number)).map((o) => o.id as number)
  if (drop.length) await db.syncQueue.bulkDelete(drop)
  let cacheCleared = false
  try {
    window.localStorage.removeItem('soma-google-cache')
    cacheCleared = true
  } catch {
    /* facultatif */
  }
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* facultatif */
  }
  return { queueBefore: all.length, queueAfter: all.length - drop.length, cacheCleared }
}

export const isQuotaError = (e: unknown): boolean => {
  const s = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? '')
  return /quota/i.test(s)
}
