import { describe, expect, it } from 'vitest'
import { parseShared, shareLink, validateSyncConfig } from './supabase'

const jwt = (role: string) => {
  const b = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b({ alg: 'HS256' })}.${b({ role })}.signature-signature`
}

describe('configuration de la synchronisation', () => {
  it('accepte une adresse et une clé publiques', () => {
    expect(validateSyncConfig({ url: 'https://abcd.supabase.co', key: jwt('anon') })).toBeNull()
  })
  it('refuse la clé secrète service_role', () => {
    expect(validateSyncConfig({ url: 'https://abcd.supabase.co', key: jwt('service_role') })).toMatch(/secrète/)
  })
  it('refuse une adresse ou une clé incomplète', () => {
    expect(validateSyncConfig({ url: 'abcd', key: jwt('anon') })).toMatch(/adresse/i)
    expect(validateSyncConfig({ url: 'https://abcd.supabase.co', key: 'court' })).toMatch(/clé/i)
  })
  it('le lien partagé se relit à l’identique', () => {
    ;(globalThis as { window?: unknown }).window = { location: { origin: 'https://x.github.io', pathname: '/soma/' } }
    const c = { url: 'https://abcd.supabase.co', key: jwt('anon') }
    const link = shareLink(c)
    expect(link.startsWith('https://x.github.io/soma/#/reglages/sync:')).toBe(true)
    expect(parseShared(link.split('/reglages/')[1])).toEqual(c)
    expect(parseShared('autre')).toBeNull()
  })
})
