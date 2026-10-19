import { DayStats } from './daily';

export interface RecapToastInput {
  readonly linked: boolean;
  /** On est sur un écran de fin (récap, ou « déjà joué »). */
  readonly onRecap: boolean;
  readonly abandoned: boolean;
  readonly gelDismissed: boolean;
  readonly streakDismissed: boolean;
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

/** Quels toasts de fin de partie s'affichent. */
export function recapToasts(input: RecapToastInput): RecapToasts {
  const shown = input.onRecap && !input.abandoned;
  const gelEarned = input.linked && shown && !input.gelDismissed && input.stats?.freezeMilestone === true;
  const gelUsed = input.linked && shown && !input.gelDismissed && !gelEarned && (input.stats?.freezesUsed ?? 0) > 0;
  return {
    gelEarned,
    gelUsed,
    guestFreezeMiss: !input.linked && input.stats?.freezeMilestone === true,
    guestStreak: !input.linked && !input.streakDismissed && input.toastStreak > 0 && input.onRecap,
  };
}
