import { DayStats } from './daily';

export interface RecapToastInput {
  readonly linked: boolean;
  /** On est sur un écran de fin (récap, ou « déjà joué »). */
  readonly onRecap: boolean;
  readonly abandoned: boolean;
  readonly stats: DayStats | null;
}

/** Les événements de série d'un compte, dits sur la carte du résultat (une ligne, jamais un toast flottant). */
export interface RecapToasts {
  /** Compte : le gel que la partie du jour a gagné (« +1 gel gagné »). */
  readonly gelEarned: boolean;
  /** Compte : des gels que la partie du jour a consommés (« 1 gel a sauvé ta série »). */
  readonly gelUsed: boolean;
}

/** Quels événements de gel la carte du résultat dit à un compte. */
export function recapToasts(input: RecapToastInput): RecapToasts {
  const shown = input.linked && input.onRecap && !input.abandoned;
  const gelEarned = shown && input.stats?.freezeMilestone === true;
  const gelUsed = shown && !gelEarned && (input.stats?.freezesUsed ?? 0) > 0;
  return { gelEarned, gelUsed };
}

/** Jours avant qu'un invité qui a fermé la tuile « crée un compte » la revoie (sauf un nouvel événement : palier de gel manqué, série perdue). */
export const GUEST_TILE_COOLDOWN_DAYS = 14;

/**
 * La tuile « crée un compte » d'un invité, sous la carte du défi :
 * - `lost` : sa série vient de se perdre (accueil, une fois par série perdue, sans croix) ;
 * - `freezeMiss` : le palier d'un gel est atteint, « tu aurais gagné un gel » ;
 * - `afterGame` : il vient de finir une partie ;
 * - `returning` : il revient sur l'accueil après avoir déjà joué (le nouveau venu ne voit que « Commencer »).
 */
export type GuestTileKind = 'lost' | 'freezeMiss' | 'afterGame' | 'returning';

/** La fermeture de la tuile, gardée dans le navigateur : le jour de jeu (`aaaa-mm-jj`) et la série affichée à ce moment. */
export interface GuestTileDismissal {
  readonly day: string;
  readonly streak: number;
}

export interface GuestTileInput {
  readonly linked: boolean;
  /** L'accueil avant la partie du jour (carte du défi). */
  readonly onWelcome: boolean;
  /** On est sur un écran de fin (récap, ou « déjà joué »). */
  readonly onRecap: boolean;
  /** La série perdue à annoncer (déjà notée comme annoncée par la page), ou `null`. */
  readonly lostStreak: number | null;
  /** Ses parties terminées, celle du jour comprise ; `null` tant qu'on ne les connaît pas. */
  readonly gamesPlayed: number | null;
  readonly stats: DayStats | null;
  /** La série à annoncer à un invité. */
  readonly toastStreak: number;
  readonly dismissal: GuestTileDismissal | null;
  /** Le jour de jeu d'aujourd'hui (`aaaa-mm-jj`). */
  readonly today: string;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Fermée depuis moins de {@link GUEST_TILE_COOLDOWN_DAYS} jours (une date illisible ou à venir compte comme une fermeture récente : mieux vaut se taire). */
function cooling(dismissal: GuestTileDismissal | null, today: string): boolean {
  if (dismissal === null) return false;
  const days = daysBetween(dismissal.day, today);
  return Number.isNaN(days) || days < GUEST_TILE_COOLDOWN_DAYS;
}

/** Quelle tuile « crée un compte » voit un invité, ou `null`. Un compte n'en voit jamais. */
export function guestTile(input: GuestTileInput): GuestTileKind | null {
  if (input.linked) return null;
  if (input.onWelcome && input.lostStreak !== null) return 'lost';
  const quiet = cooling(input.dismissal, input.today);
  if (input.onRecap && input.toastStreak > 0 && input.gamesPlayed !== null) {
    // Un palier de gel n'attend pas la fin du délai : il ne se tait que s'il a été fermé pour cette même série.
    if (input.stats?.freezeMilestone === true && input.dismissal?.streak !== input.toastStreak) return 'freezeMiss';
    return quiet ? null : 'afterGame';
  }
  if (input.onWelcome && (input.gamesPlayed ?? 0) > 0 && !quiet) return 'returning';
  return null;
}
