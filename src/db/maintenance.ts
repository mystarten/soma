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

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`pas de réponse après ${ms / 1000} s`)), ms)
    p.then((v) => { window.clearTimeout(t); resolve(v) }, (e) => { window.clearTimeout(t); reject(e) })
  })

/** La base de données du navigateur répond-elle ? (un blocage silencieux fait croire que « rien ne se passe ») */
export async function dbHealth(ms = 4000): Promise<{ ok: boolean; detail: string }> {
  try {
    await withTimeout(db.meta.put({ key: 'health', value: Date.now() }), ms)
    return { ok: true, detail: 'ok' }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? `${e.name !== 'Error' ? e.name + ' : ' : ''}${e.message}` : String(e) }
  }
}

/** Teste chaque type d'écriture séparément, avec un délai maximal, et affiche chaque résultat dès qu'il arrive. */
export async function writeTest(onStep: (r: { label: string; ok: boolean; detail: string }[]) => void): Promise<void> {
  const out: { label: string; ok: boolean; detail: string }[] = []
  const run = async (label: string, fn: () => Promise<void> | void) => {
    try {
      await withTimeout(Promise.resolve().then(fn), 4000)
      out.push({ label, ok: true, detail: 'ok' })
    } catch (e) {
      out.push({ label, ok: false, detail: e instanceof Error ? `${e.name !== 'Error' ? e.name + ' : ' : ''}${e.message}` : String(e) })
    }
    onStep([...out])
  }
  await run('Mémoire du navigateur (localStorage)', () => {
    window.localStorage.setItem('soma-test', 'x'.repeat(2000))
    window.localStorage.removeItem('soma-test')
  })
  await run('Cache de l’appli (Cache Storage)', async () => {
    const c = await caches.open('soma-write-test')
    await c.put('/t', new Response('x'.repeat(20000)))
    await caches.delete('soma-write-test')
  })
  await run('Base de données (IndexedDB)', async () => {
    await db.meta.put({ key: 'write_test', value: 'x'.repeat(20000) })
    await db.meta.delete('write_test')
  })
}
