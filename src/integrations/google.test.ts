import { describe, expect, it } from 'vitest'
import { parseEvents, parseMessage, senderName, validateClientId } from './google'

describe('Google Agenda', () => {
  it('lit les événements horaires et sur la journée, triés', () => {
    const ev = parseEvents({
      items: [
        { id: 'b', summary: 'Journée libre', start: { date: '2026-11-13' }, end: { date: '2026-11-14' } },
        { id: 'a', summary: 'Dentiste', location: 'Rue X', start: { dateTime: '2026-11-12T09:30:00+01:00' }, end: { dateTime: '2026-11-12T10:15:00+01:00' } },
        { id: 'c', status: 'cancelled', summary: 'Annulé', start: { date: '2026-11-12' } },
        { summary: 'sans id', start: { date: '2026-11-12' } },
      ],
    })
    expect(ev.map((e) => e.id)).toEqual(['a', 'b'])
    expect(ev[0]).toMatchObject({ title: 'Dentiste', allDay: false, location: 'Rue X' })
    expect(ev[0].time).toMatch(/^\d\d:\d\d$/)
    expect(ev[1]).toMatchObject({ allDay: true, day: '2026-11-13', time: undefined })
  })
  it('un titre vide devient « sans titre »', () => {
    expect(parseEvents({ items: [{ id: 'x', start: { date: '2026-11-12' } }] })[0].title).toBe('(sans titre)')
  })
})

describe('Gmail', () => {
  const raw = {
    id: 'm1',
    threadId: 't1',
    snippet: 'Bonjour &amp; bienvenue',
    labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
    payload: { headers: [{ name: 'From', value: '"Alex Test" <alex@example.com>' }, { name: 'Subject', value: 'Rendez-vous' }, { name: 'Date', value: 'Wed, 11 Nov 2026 08:00:00 +0100' }] },
  }
  it('lit expéditeur, objet, drapeaux et lien', () => {
    const m = parseMessage(raw)!
    expect(m).toMatchObject({ from: 'Alex Test', subject: 'Rendez-vous', unread: true, important: true, snippet: 'Bonjour & bienvenue' })
    expect(m.url).toContain('t1')
    expect(m.date).toMatch(/^2026-11-11/)
  })
  it('nom de l’expéditeur', () => {
    expect(senderName('Alex <a@b.fr>')).toBe('Alex')
    expect(senderName('<a@b.fr>')).toBe('a@b.fr')
    expect(senderName('a@b.fr')).toBe('a@b.fr')
  })
  it('message sans identifiant ignoré', () => {
    expect(parseMessage({})).toBeNull()
  })
})

describe('identifiant client', () => {
  it('valide le format', () => {
    expect(validateClientId('123456-abc123.apps.googleusercontent.com')).toBeNull()
    expect(validateClientId('abc')).toMatch(/ressembler/)
  })
})
