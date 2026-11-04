/** Bornes de la part du pool en cooldown, en pourcentage (celles que l'API accepte, sinon 400). */
export const COOLDOWN_MIN_PERCENT = 10;
export const COOLDOWN_MAX_PERCENT = 90;

/**
 * Seuil d'alerte du cooldown, en jours : en dessous, un morceau revient trop vite, il faut ajouter des morceaux au pool.
 * Il ne bloque rien (#275), il colore le cooldown de l'onglet Morceaux et y affiche un avertissement.
 */
export const COOLDOWN_ALERT_DAYS = 14;
/** En dessous, le cooldown est critique (rouge). */
export const COOLDOWN_CRITICAL_DAYS = 7;

/** Le cooldown en vigueur : la part du pool réglée, et ce qu'elle donne aujourd'hui sur le pool jouable. */
export interface CooldownSettings {
  readonly poolPercent: number;
  readonly days: number;
  readonly playableCount: number;
}

/** La couleur du cooldown : critique (moins de 7 jours), sous le seuil d'alerte (moins de 14), ou suffisant. */
export type CooldownTone = 'low' | 'medium' | 'high';

export function cooldownTone(days: number): CooldownTone {
  if (days < COOLDOWN_CRITICAL_DAYS) return 'low';
  if (days < COOLDOWN_ALERT_DAYS) return 'medium';
  return 'high';
}

/** Une part valide : un entier de 10 à 90 %. */
export function isValidCooldownPercent(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= COOLDOWN_MIN_PERCENT && value <= COOLDOWN_MAX_PERCENT;
}
