/**
 * La série et les gels d'un joueur, vus d'aujourd'hui (gélule de l'en-tête, panneau de série, accueil, toasts). Mêmes champs que la
 * réponse du back (`StreakResponse`), dates en texte `aaaa-mm-jj`.
 */
export interface Streak {
  /** `active` | `protected` (un jour manqué couvert par un gel) | `broken`. */
  readonly status: 'active' | 'protected' | 'broken';
  /** Série effective (0 si cassée). */
  readonly streak: number;
  /** Gels en stock, déduction faite de ceux déjà engagés sur les jours manqués d'une série protégée (0 pour un invité). */
  readonly freezes: number;
  readonly maxFreezes: number;
  readonly freezeEveryDays: number;
  /** Jours de série restants avant le prochain gel (vide pour un invité). */
  readonly nextFreezeInDays: number | null;
  readonly missedDays: number;
  /** Série perdue par un invité, au-dessus du seuil d'incitation (sinon vide). */
  readonly lostStreak: number | null;
  /** Jour du dernier défi terminé, `aaaa-mm-jj`. */
  readonly lastPlayedDate: string | null;
}

/** État neutre d'une série, tant que le serveur n'a pas répondu. */
export const EMPTY_STREAK: Streak = {
  status: 'active', streak: 0, freezes: 0, maxFreezes: 0, freezeEveryDays: 0,
  nextFreezeInDays: null, missedDays: 0, lostStreak: null, lastPlayedDate: null,
};

/**
 * État de la gélule de série de l'en-tête :
 * - `lost` : aucune série en cours (0, flamme grise) ;
 * - `guest` : invité, série sans gel ;
 * - `protected` : compte connecté, jour(s) manqué(s) couverts par un gel (bordure cyan + pulse) ;
 * - `on` : compte connecté, série active + stock de gels.
 */
export type StreakPillMode = 'on' | 'protected' | 'guest' | 'lost';

export function streakPillMode(streak: Streak | null, linked: boolean): StreakPillMode {
  if (!streak || streak.streak === 0) return 'lost';
  if (!linked) return 'guest';
  return streak.status === 'protected' ? 'protected' : 'on';
}

/** Stock de gels déjà au plafond (`nextFreezeInDays` du back l'ignore : c'est ici qu'on le vérifie). */
export function isFreezeStockFull(streak: Streak): boolean {
  return streak.freezes >= streak.maxFreezes;
}

/** Compte connecté dont la série est actuellement protégée par un gel. */
export function isStreakProtected(streak: Streak | null, linked: boolean): boolean {
  return linked && streak?.status === 'protected';
}

/** Suffixe de clé i18n singulier/pluriel (« 1 jour », « 2 jours » : 0 et 1 au singulier). */
export function pluralKey(n: number): 'one' | 'other' {
  return n > 1 ? 'other' : 'one';
}

/** Une date `aaaa-mm-jj` (ou plus longue : un horodatage ISO) en minuit UTC, ou `null`. */
export function toUtcDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Clé stable d'une date (mémoire du toast « série perdue »). */
export function dateKey(value: string | null | undefined): string | null {
  return toUtcDate(value)?.toISOString().slice(0, 10) ?? null;
}
