import { DayStats } from './daily';

export interface RecapToastInput {
  readonly linked: boolean;
  /** On est sur un écran de fin (récap, ou « déjà joué »). */
  readonly onRecap: boolean;
  readonly abandoned: boolean;
  readonly gelDismissed: boolean;
  /** Invité : la série affichée quand il a fermé le bandeau « crée un compte » (mémorisée dans le navigateur), `null` s'il ne l'a jamais fermé. */
  readonly streakDismissedAt: number | null;
  /** Invité : ses parties terminées, celle du jour comprise ; `null` tant qu'on ne les connaît pas. */
  readonly gamesPlayed: number | null;
  readonly stats: DayStats | null;
  /** La série à annoncer à un invité. */
  readonly toastStreak: number;
}

export interface RecapToasts {
  /** Compte : le gel que la partie du jour a gagné (« +1 gel gagné ! »). */
  readonly gelEarned: boolean;
  /** Compte : des gels que la partie du jour a consommés (« 1 gel a sauvé ta série »). */
  readonly gelUsed: boolean;
  /** Invité : le palier d'un gel est atteint (« Tu aurais gagné un gel ! »). */
  readonly guestFreezeMiss: boolean;
  /** Invité : « ta série n'est pas sauvegardée ». */
  readonly guestStreak: boolean;
}

/** L'invité découvre le jeu : le bandeau « crée un compte » le suit pendant ses premières parties. */
export const GUEST_STREAK_INTRO_GAMES = 3;

/**
 * Le bandeau « crée un compte » d'un invité : à chaque fin de ses {@link GUEST_STREAK_INTRO_GAMES} premières parties tant qu'il ne l'a pas
 * fermé, puis seulement aux paliers de gel (« Tu aurais gagné un gel ! »), là où perdre sa série commence à coûter. Fermé à un palier, il
 * ne revient qu'au suivant. Le bouton de l'accueil reste toujours là.
 */
function guestStreakDue(input: RecapToastInput): boolean {
  if (input.linked || !input.onRecap || input.toastStreak <= 0 || input.gamesPlayed === null) return false;
  if (input.gamesPlayed <= GUEST_STREAK_INTRO_GAMES) return input.streakDismissedAt === null;
  return input.stats?.freezeMilestone === true && input.streakDismissedAt !== input.toastStreak;
}

/** Quels toasts de fin de partie s'affichent. */
export function recapToasts(input: RecapToastInput): RecapToasts {
  const shown = input.onRecap && !input.abandoned;
  const gelEarned = input.linked && shown && !input.gelDismissed && input.stats?.freezeMilestone === true;
  const gelUsed = input.linked && shown && !input.gelDismissed && !gelEarned && (input.stats?.freezesUsed ?? 0) > 0;
  return {
    gelEarned,
    gelUsed,
    guestFreezeMiss: !input.linked && input.stats?.freezeMilestone === true,
    guestStreak: guestStreakDue(input),
  };
}
