import { useEffect } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useSoma } from '../../hooks/useSoma'
import type { Task } from '../../types'
import { connectGoogle, refreshGoogle, useGoogle } from '../../integrations/useGoogle'
import type { AgendaEvent, MailItem } from '../../integrations/google'
import { saveTask } from '../../db/repo'
import { uid } from '../../db/db'
import { navigate } from '../../lib/router'
import { parseDay } from '../../engine/time'
import { Button } from '../ui/primitives'

/* Agenda et mails (lecture seule) : un panneau chacun, ou une invitation à se connecter. */

function useAutoRefresh() {
  const g = useGoogle()
  useEffect(() => {
    if (!g.connected) return
    const old = !g.at || Date.now() - Date.parse(g.at) > 5 * 60_000
    if (old) void refreshGoogle()
    const t = window.setInterval(() => void refreshGoogle(), 10 * 60_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.connected])
  return g
}

function Shell({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-label={title} className="glass rounded-[var(--radius-card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[0.95rem] font-medium text-mist-100">{title}</h3>
          {subtitle && <p className="text-xs text-mist-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Invite({ title, what }: { title: string; what: string }) {
  const g = useGoogle()
  return (
    <Shell title={title} subtitle="Lecture seule">
      <p className="text-xs text-mist-300">{what}</p>
      {g.configured ? (
        <Button variant="primary" full className="mt-3" onClick={() => void connectGoogle()}>
          Se connecter à Google
        </Button>
      ) : (
        <Button variant="primary" full className="mt-3" onClick={() => navigate('reglages')}>
          Configurer Google
        </Button>
      )}
      {g.error && <p className="mt-2 text-xs text-[#ffb02e]">{g.error}</p>}
    </Shell>
  )
}

const dayHead = (day: string, today: string) => {
  const d = parseDay(day)
  const diff = Math.round((d.getTime() - parseDay(today).getTime()) / 86_400_000)
  const label = format(d, 'EEEE d MMM', { locale: fr })
  return diff === 0 ? `Aujourd’hui · ${label}` : diff === 1 ? `Demain · ${label}` : label
}

export function AgendaPanel() {
  const data = useSoma()
  const g = useAutoRefresh()
  if (!g.connected && !g.agenda.length) return <Invite title="Agenda" what="Tes prochains rendez-vous Google Agenda, ici, sans quitter l’app." />

  const upcoming = g.agenda.filter((e) => e.day >= data.today).slice(0, 12)
  const groups = new Map<string, AgendaEvent[]>()
  for (const e of upcoming) groups.set(e.day, [...(groups.get(e.day) ?? []), e])

  const toTask = async (e: AgendaEvent) => {
    const now = new Date().toISOString()
    const t: Task = {
      id: uid('task'),
      title: e.title,
      due: e.day,
      dueTime: e.time,
      priority: 'normale',
      category: 'perso',
      kind: 'rdv',
      status: 'a_faire',
      source: { kind: 'event', ref: e.id, url: e.url },
      createdAt: now,
      updatedAt: now,
    }
    await saveTask(t)
  }

  return (
    <Shell
      title="Agenda"
      subtitle={g.loading ? 'Mise à jour…' : g.at ? `Mis à jour à ${format(new Date(g.at), 'HH:mm')}` : undefined}
      action={
        <button className="text-xs text-accent" onClick={() => void (g.connected ? refreshGoogle() : connectGoogle())}>
          {g.connected ? 'Actualiser' : 'Se reconnecter'}
        </button>
      }
    >
      {g.error && <p className="mb-2 text-xs text-[#ffb02e]">{g.error}</p>}
      {groups.size === 0 ? (
        <p className="py-3 text-center text-xs text-mist-700">Rien dans les 14 prochains jours.</p>
      ) : (
        <div className="space-y-3">
          {[...groups.entries()].map(([day, evs]) => (
            <div key={day}>
              <div className="mb-1 text-[0.62rem] tracking-wider text-mist-500 uppercase">{dayHead(day, data.today)}</div>
              <ul className="space-y-1">
                {evs.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/4">
                    <span className="w-11 shrink-0 text-xs text-accent tnum">{e.allDay ? 'jour' : e.time}</span>
                    <a href={e.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-mist-100">{e.title}</span>
                      {e.location && <span className="block truncate text-[0.66rem] text-mist-700">{e.location}</span>}
                    </a>
                    <button onClick={() => void toTask(e)} className="shrink-0 rounded-md bg-white/6 px-2 py-1 text-[0.65rem] text-mist-300" title="Ajouter à mes tâches">
                      + tâche
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

export function MailPanel() {
  const g = useAutoRefresh()
  if (!g.connected && !g.mails.length) return <Invite title="Mails" what="Tes mails non lus et importants, les 20 plus récents. Tu ne peux ni répondre ni supprimer d’ici." />

  const toTask = async (m: MailItem) => {
    const now = new Date().toISOString()
    await saveTask({
      id: uid('task'),
      title: `Répondre : ${m.subject}`.slice(0, 120),
      priority: m.important ? 'haute' : 'normale',
      category: 'perso',
      kind: 'tache',
      status: 'a_faire',
      source: { kind: 'mail', ref: m.id, url: m.url },
      notes: `De ${m.from}`,
      createdAt: now,
      updatedAt: now,
    })
  }
  const unread = g.mails.filter((m) => m.unread).length

  return (
    <Shell
      title="Mails"
      subtitle={`${unread} non lu${unread > 1 ? 's' : ''} · ${g.mails.length} affichés`}
      action={
        <button className="text-xs text-accent" onClick={() => void (g.connected ? refreshGoogle() : connectGoogle())}>
          {g.connected ? 'Actualiser' : 'Se reconnecter'}
        </button>
      }
    >
      {g.error && <p className="mb-2 text-xs text-[#ffb02e]">{g.error}</p>}
      {g.mails.length === 0 ? (
        <p className="py-3 text-center text-xs text-mist-700">Boîte de réception à jour.</p>
      ) : (
        <ul className="space-y-1">
          {g.mails.slice(0, 20).map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white/4">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.unread ? 'var(--accent)' : 'transparent', boxShadow: m.important ? '0 0 0 1px #ffc24b' : undefined }} />
              <a href={m.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${m.unread ? 'font-medium text-mist-100' : 'text-mist-300'}`}>{m.from}</span>
                  <span className="shrink-0 text-[0.62rem] text-mist-700 tnum">{m.date ? format(new Date(m.date), 'd MMM HH:mm', { locale: fr }) : ''}</span>
                </span>
                <span className="block truncate text-xs text-mist-300">{m.subject}</span>
              </a>
              <button onClick={() => void toTask(m)} className="shrink-0 rounded-md bg-white/6 px-2 py-1 text-[0.65rem] text-mist-300" title="Ajouter à mes tâches">
                + tâche
              </button>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
