import { StreakDto } from './game.models';

/**
 * État de la gélule de série du header (cf. maquette gel de série) :
 * - `lost`      : aucune série en cours (0, flamme grise) ;
 * - `guest`     : invité, série sans gel ;
 * - `protected` : compte connecté, jour(s) manqué(s) couverts par un gel (bordure cyan + pulse) ;
 * - `on`        : compte connecté, série active + stock de gels.
 */
export type StreakPillMode = 'on' | 'protected' | 'guest' | 'lost';

export function streakPillMode(streak: StreakDto | null, linked: boolean): StreakPillMode {
  if (!streak || streak.streak === 0) return 'lost';
  if (!linked) return 'guest';
  return streak.status === 'protected' ? 'protected' : 'on';
}

/** Suffixe de clé i18n singulier/pluriel (« 1 jour », « 2 jours » — 0 et 1 au singulier). */
export function pluralKey(n: number): 'one' | 'other' {
  return n > 1 ? 'other' : 'one';
}

/**
 * `DateOnly` sérialisé par le back en « yyyy-MM-dd » (typé `Date` par NSwag mais reçu brut
 * à l'exécution) → Date UTC minuit, ou null.
 */
export function toUtcDate(value: unknown): Date | null {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value !== 'string' || value.length < 10) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Clé stable d'un `DateOnly` (localStorage du toast « série perdue »). */
export function dateKey(value: unknown): string | null {
  return toUtcDate(value)?.toISOString().slice(0, 10) ?? null;
}
