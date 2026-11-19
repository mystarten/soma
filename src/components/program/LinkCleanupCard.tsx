import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { Program } from '../../types'
import { applyLinkChange, linkCleanup } from '../../engine/programSession'
import { parseDay } from '../../engine/time'
import { db } from '../../db/db'
import { saveWorkouts } from '../../db/repo'
import { backupNow } from '../../db/backup'
import { Button, Card, Sheet } from '../ui/primitives'

const KEY = 'soma-links-cleanup-later'
const read = () => {
  try {
    return window.localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Nettoyage unique des anciens liens du journal : la semaine de chaque séance du programme est recalculée d'après sa date.
 * La liste des changements est montrée avant d'être appliquée, et chaque ligne peut être décochée.
 * La carte n'apparaît que s'il y a quelque chose à corriger ; « Plus tard » la masque jusqu'à ce que la liste change.
 */
export default function LinkCleanupCard({ program, onDone }: { program: Program; onDone: (message: string) => void }) {
  const data = useSoma()
  const { changes, outside } = useMemo(() => linkCleanup(program, data.workouts, data.settings.programStart), [program, data.workouts, data.settings.programStart])
  const signature = useMemo(() => changes.map((c) => `${c.id}:${c.moves.map((m) => `${m.code}${m.from}>${m.to}`).join(',')}`).join('|'), [changes])
  const [later, setLater] = useState(read)
  const [open, setOpen] = useState(false)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  if (!changes.length || later === signature) return null
  const chosen = changes.filter((c) => !skip.has(c.id))

  const apply = async () => {
    setBusy(true)
    await backupNow('avant correction des liens du journal')
    const rows = []
    for (const c of chosen) {
      const cur = await db.workouts.get(c.id)
      if (cur && !cur.deleted) rows.push(applyLinkChange(cur, c))
    }
    if (rows.length) await saveWorkouts(rows)
    setBusy(false)
    setOpen(false)
    onDone(`${rows.length} séance${rows.length > 1 ? 's' : ''} corrigée${rows.length > 1 ? 's' : ''}`)
  }

  return (
    <>
      <Card title="Corriger les liens du journal" subtitle={`${changes.length} séance${changes.length > 1 ? 's sont rattachées' : ' est rattachée'} à une autre semaine que celle de leur date.`}>
        <p className="mt-2 text-xs text-mist-300">Exemple : « {changes[0].moves[0].code} · S{changes[0].moves[0].from} » le {format(parseDay(changes[0].day), 'd MMMM', { locale: fr })} correspond à la semaine {changes[0].moves[0].to} du programme. Rien n’est modifié avant ta validation.</p>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Button variant="primary" onClick={() => setOpen(true)}>Voir les changements</Button>
          <Button onClick={() => { try { window.localStorage.setItem(KEY, signature) } catch { /* facultatif */ } setLater(signature) }}>Plus tard</Button>
        </div>
      </Card>
      {open && (
        <Sheet
          open
          onClose={() => setOpen(false)}
          title="Corriger les liens du journal"
          footer={
            <div className="grid grid-cols-[1fr_auto] gap-2.5">
              <Button variant="primary" disabled={busy || !chosen.length} onClick={apply}>Appliquer ({chosen.length})</Button>
              <Button onClick={() => setOpen(false)}>Annuler</Button>
            </div>
          }
        >
          <div className="space-y-3 pb-2">
            <p className="text-sm text-mist-300">
              Pour chaque séance, la semaine est recalculée d’après sa date. <b className="text-mist-100">Seuls le lien avec le programme et le titre changent</b> : tes séries, notes, durée et effort restent tels quels. Une sauvegarde est faite juste avant. Décoche une ligne pour la laisser comme elle est.
            </p>
            <ul className="divide-y divide-white/6">
              {changes.map((c) => {
                const on = !skip.has(c.id)
                return (
                  <li key={c.id}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setSkip((s) => { const n = new Set(s); if (on) n.add(c.id); else n.delete(c.id); return n })}
                        className="h-6 w-6 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1 text-sm text-mist-100">
                        <span className="block text-xs text-mist-500">{format(parseDay(c.day), 'EEEE d MMMM', { locale: fr })}</span>
                        <span className="block">{c.moves.map((m) => `${m.code} : S${m.from} → S${m.to}`).join(' · ')}</span>
                        {c.oldTitle !== c.newTitle && <span className="block truncate text-xs text-mist-500">{c.oldTitle} → {c.newTitle}</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {outside > 0 && <p className="text-xs text-mist-500">{outside} séance{outside > 1 ? 's' : ''} du journal {outside > 1 ? 'sont' : 'est'} en dehors des dates du programme : {outside > 1 ? 'elles restent' : 'elle reste'} telle{outside > 1 ? 's' : ''} quelle{outside > 1 ? 's' : ''}.</p>}
          </div>
        </Sheet>
      )}
    </>
  )
}
