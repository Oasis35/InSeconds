import { POPULAR_DOMAINS, run as suggestMailDomain } from '@zootools/email-spell-checker';

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

/**
 * Domaines courants en France, ajoutés à ceux de la bibliothèque (surtout américains) : la
 * suggestion ne propose qu'un domaine de cette liste.
 */
const FRENCH_DOMAINS = [
  'gmail.com', 'hotmail.fr', 'hotmail.com', 'outlook.fr', 'outlook.com', 'live.fr', 'msn.com', 'yahoo.fr', 'yahoo.com',
  'icloud.com', 'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'laposte.net', 'bbox.fr', 'numericable.fr',
  'aliceadsl.fr', 'club-internet.fr', 'gmx.fr', 'aol.fr', 'protonmail.com', 'proton.me',
];
const SUGGESTED_DOMAINS = [...new Set([...FRENCH_DOMAINS, ...POPULAR_DOMAINS])];
/** Ce qui précède le premier point du domaine (`hotmal` dans `hotmal.fr`). */
const SECOND_LEVEL_DOMAINS = ['gmail', 'hotmail', 'outlook', 'live', 'yahoo', 'orange', 'wanadoo', 'free', 'sfr', 'laposte', 'icloud'];

/**
 * Adresse corrigée quand le domaine ressemble à un domaine courant mal tapé (`gmial.com` →
 * `gmail.com`), sinon `null`. Ne regarde que ce qui suit le « @ », par une liste fixe et sans
 * aucune requête : rien ne dit si une adresse a un compte (pas d'énumération). Une faute avant
 * le « @ » ne se voit pas, c'est voulu.
 */
export function suggestEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!isPlausibleEmail(email)) return null;
  const suggestion = suggestMailDomain({ email, domains: SUGGESTED_DOMAINS, secondLevelDomains: SECOND_LEVEL_DOMAINS });
  const at = email.lastIndexOf('@');
  if (!suggestion || suggestion.domain === email.slice(at + 1).toLowerCase()) return null;
  // La bibliothèque met toute l'adresse en minuscules : seul le domaine est repris d'elle.
  return `${email.slice(0, at)}@${suggestion.domain}`;
}
