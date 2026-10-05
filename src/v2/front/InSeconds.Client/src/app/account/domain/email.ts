/**
 * Adresse e-mail plausible : un « @ », un domaine avec un point. Même esprit que `EmailAddress()`
 * côté back, sans la RFC complète. Quantificateurs bornés (limites RFC 5321 : 64 / 253 / 24) pour
 * qu'une saisie pathologique ne provoque pas de retour arrière coûteux (Sonar typescript:S8786).
 */
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,24}$/;

/** Adresse telle que l'envoie le front : sans espaces autour. */
export function normalizeEmail(raw: string): string {
  return raw.trim();
}

export function isPlausibleEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(raw));
}

/** Les adresses se comparent sans tenir compte de la casse (colonne `citext` côté back). */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}
