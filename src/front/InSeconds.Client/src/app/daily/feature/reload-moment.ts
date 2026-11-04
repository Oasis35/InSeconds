import { ReloadMoment } from '../../core/version/version.service';
import { DailyScreen } from '../domain/daily-screen';

/**
 * Quand une nouvelle version peut recharger la page du jeu : tout de suite quand rien n'est en cours (la partie à reprendre est
 * enregistrée sur le serveur) ; au passage en arrière-plan pendant le récap ou un chargement (score, partage, démarrage de la
 * partie) ; jamais pendant une manche, seulement au prochain changement de page (après la confirmation de sortie).
 */
export function reloadMomentFor(screen: DailyScreen): ReloadMoment {
  switch (screen) {
    case 'playing':
      return 'navigation';
    case 'done':
    case 'loading':
      return 'background';
    default:
      return 'now';
  }
}
