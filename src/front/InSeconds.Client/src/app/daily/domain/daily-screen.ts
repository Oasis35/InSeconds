import { TodayState } from './daily';

/** Les écrans de l'accueil pour le défi du jour (la manche est la page `/daily`, elle n'est pas un écran de l'accueil). */
export type DailyScreen = 'loading' | 'welcome' | 'resume_prompt' | 'done' | 'already_played' | 'no_challenge' | 'error';

/**
 * Pourquoi on relit l'état du jour (`GET /api/daily/today`) :
 * - `initial` : premier chargement, ou « Réessayer » ;
 * - `refocus` : retour de l'onglet au premier plan depuis l'accueil ou la reprise.
 */
export type PeekContext = 'initial' | 'refocus';

export interface ScreenChange {
  readonly screen: DailyScreen;
  /** Renseigné quand on arrive sur « déjà joué » : la partie a-t-elle été abandonnée ? */
  readonly abandoned: boolean | null;
}

/** L'écran qui suit la lecture de l'état du jour. */
export function screenAfterToday(state: TodayState): ScreenChange {
  switch (state) {
    case 'can_start':
      return { screen: 'welcome', abandoned: null };
    case 'resumable':
      return { screen: 'resume_prompt', abandoned: null };
    case 'already_played':
      return { screen: 'already_played', abandoned: false };
    case 'abandoned':
      return { screen: 'already_played', abandoned: true };
    case 'no_challenge':
    default:
      return { screen: 'no_challenge', abandoned: null };
  }
}

/** Le contexte de relecture quand l'onglet revient au premier plan sur l'accueil ; vide si rien ne doit être relu. */
export function refocusContext(screen: DailyScreen): PeekContext | null {
  return screen === 'welcome' || screen === 'resume_prompt' ? 'refocus' : null;
}

/** Un écran de fin (récap de la partie, ou « déjà joué ») : c'est là que les toasts de série et de gels s'affichent. */
export function isRecapScreen(screen: DailyScreen): boolean {
  return screen === 'done' || screen === 'already_played';
}
