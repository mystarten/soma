import { describe, expect, it } from 'vitest'
import { displayName, toLoginId } from './username'

describe('nom d’utilisateur', () => {
  it('fabrique un identifiant à partir du pseudo, en minuscules', () => {
    expect(toLoginId('  Mats_Serre ')).toEqual({ id: 'mats_serre@mystarten.github.io' })
  })
  it('refuse les pseudos trop courts ou avec des caractères étranges', () => {
    expect('error' in toLoginId('ab')).toBe(true)
    expect('error' in toLoginId('mon pseudo')).toBe(true)
    expect('error' in toLoginId('é-é-é')).toBe(true)
  })
  it('accepte encore un vrai email', () => {
    expect(toLoginId('Moi@Exemple.fr')).toEqual({ id: 'moi@exemple.fr' })
    expect('error' in toLoginId('moi@')).toBe(true)
  })
  it('affiche le pseudo sans l’adresse fabriquée', () => {
    expect(displayName('paul@mystarten.github.io')).toBe('paul')
    expect(displayName('moi@exemple.fr')).toBe('moi@exemple.fr')
  })
})
