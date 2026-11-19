import { db, nowIso } from './db'
import { exportBackup } from './repo'

/* Sauvegarde automatique avant chaque changement de version de l'appli : une copie complète des données,
   gardée dans cet appareil (les 3 dernières). Rien n'est supprimé par une mise à jour sans cette copie. */

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
const PREFIX = 'backup:'
const KEEP = 3

export async function autoBackupOnUpgrade(): Promise<void> {
  try {
    const prev = (await db.meta.get('app_version'))?.value as string | undefined
    if (prev === APP_VERSION) return
    const hasData = (await db.workouts.count()) + (await db.programs.count()) + (await db.checkins.count()) > 0
    if (hasData) {
      const b = await exportBackup()
      await db.meta.put({ key: `${PREFIX}${nowIso()}|${prev ?? 'ancienne'}->${APP_VERSION}`, value: JSON.stringify(b) })
      const keys = (await db.meta.toArray()).map((m) => m.key).filter((k) => k.startsWith(PREFIX)).sort()
      for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) await db.meta.delete(k)
    }
    await db.meta.put({ key: 'app_version', value: APP_VERSION })
  } catch {
    /* une sauvegarde qui échoue (stockage plein) ne doit jamais empêcher l'appli de démarrer */
  }
}

export interface AutoBackup {
  key: string
  at: string
  label: string
  bytes: number
}

export async function listBackups(): Promise<AutoBackup[]> {
  const rows = (await db.meta.toArray()).filter((m) => m.key.startsWith(PREFIX))
  return rows
    .map((m) => {
      const [at, label] = m.key.slice(PREFIX.length).split('|')
      return { key: m.key, at, label: label ?? '', bytes: String(m.value).length }
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

export async function getBackupJson(key: string): Promise<string | null> {
  const r = await db.meta.get(key)
  return r ? String(r.value) : null
}
