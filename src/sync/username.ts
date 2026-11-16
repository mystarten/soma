/* Connexion par nom d'utilisateur : le serveur de comptes veut un email, on en fabrique un à partir du pseudo.
   Aucun email n'est jamais envoyé à cette adresse. Un vrai email reste accepté pour les anciens comptes. */

const DOMAIN = 'mystarten.github.io'

export const USERNAME_HELP = 'Nom d’utilisateur : 3 à 24 caractères (lettres, chiffres, point, tiret ou tiret bas).'

/** Renvoie l'identifiant de connexion à envoyer au serveur, ou une erreur lisible. */
export function toLoginId(input: string): { id: string } | { error: string } {
  const v = input.trim().toLowerCase()
  if (v.includes('@')) return /^\S+@\S+\.\S+$/.test(v) ? { id: v } : { error: 'Cet email n’a pas l’air valide.' }
  if (!/^[a-z0-9._-]{3,24}$/.test(v)) return { error: USERNAME_HELP }
  return { id: `${v}@${DOMAIN}` }
}

/** Ce qu'on montre à l'écran : le pseudo, sans l'adresse fabriquée. */
export function displayName(id: string): string {
  return id.endsWith(`@${DOMAIN}`) ? id.slice(0, -(DOMAIN.length + 1)) : id
}
