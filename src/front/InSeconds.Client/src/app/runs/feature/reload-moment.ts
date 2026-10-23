import { ReloadMoment } from '../../core/version/version.service';
import { RunScreen } from '../data-access/run-game.store';

/**
 * Quand une nouvelle version peut recharger la page du mode Run : tout de suite quand rien n'est en cours (la partie se reprend depuis le
 * serveur), au passage en arrière-plan pendant un chargement ou la fin, jamais pendant une manche (seulement au prochain changement de page,
 * après la confirmation de sortie).
 */
export function reloadMomentFor(screen: RunScreen): ReloadMoment {
  switch (screen) {
    case 'playing':
      return 'navigation';
    case 'loading':
    case 'finished':
      return 'background';
    default:
      return 'now';
  }
}
