import { TodayState } from './daily';

/** Les écrans de la partie du jour. */
export type DailyScreen = 'loading' | 'welcome' | 'resume_prompt' | 'playing' | 'done' | 'already_played' | 'no_challenge' | 'error';

/**
 * Pourquoi on relit l'état du jour (`GET /api/daily/today`) :
 * - `initial` : premier chargement, ou « Réessayer » ;
 * - `refocus` : retour de l'onglet au premier plan depuis l'accueil ou la reprise ;
 * - `playing` : retour au premier plan pendant une partie : on ne quitte la partie QUE si elle a été terminée ou abandonnée
 *   ailleurs (jamais vers l'accueil ni la reprise).
 */
export type PeekContext = 'initial' | 'refocus' | 'playing';

export interface ScreenChange {
  readonly screen: DailyScreen;
  /** Renseigné quand on arrive sur « déjà joué » : la partie a-t-elle été abandonnée ? */
  readonly abandoned: boolean | null;
}

/** L'écran qui suit la lecture de l'état du jour. */
export function screenAfterToday(current: DailyScreen, context: PeekContext, state: TodayState): ScreenChange {
  const keepWhenPlaying = (screen: DailyScreen): ScreenChange => ({ screen: context === 'playing' ? current : screen, abandoned: null });
  switch (state) {
    case 'can_start':
      return keepWhenPlaying('welcome');
    case 'resumable':
      return keepWhenPlaying('resume_prompt');
    case 'already_played':
      return { screen: 'already_played', abandoned: false };
    case 'abandoned':
      return { screen: 'already_played', abandoned: true };
    case 'no_challenge':
    default:
      return keepWhenPlaying('no_challenge');
  }
}

/** Le contexte de relecture quand l'onglet revient au premier plan ; vide si rien ne doit être relu. */
export function refocusContext(screen: DailyScreen): PeekContext | null {
  if (screen === 'welcome' || screen === 'resume_prompt') return 'refocus';
  return screen === 'playing' ? 'playing' : null;
}

/** Un écran de fin (récap de la partie, ou « déjà joué ») : c'est là que les toasts de série et de gels s'affichent. */
export function isRecapScreen(screen: DailyScreen): boolean {
  return screen === 'done' || screen === 'already_played';
}
