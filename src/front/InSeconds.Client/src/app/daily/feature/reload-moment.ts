import { ReloadMoment } from '../../core/version/version.service';
import { DailyScreen } from '../domain/daily-screen';

/**
 * Quand une nouvelle version peut recharger l'accueil du jeu : tout de suite quand rien n'est en cours (la partie à reprendre est
 * enregistrée sur le serveur) ; au passage en arrière-plan pendant le récap ou un chargement (score, partage). La manche (`/daily`)
 * n'est jamais rechargée en route, seulement au prochain changement de page (`DailyShellComponent`).
 */
export function reloadMomentFor(screen: DailyScreen): ReloadMoment {
  switch (screen) {
    case 'done':
    case 'loading':
      return 'background';
    default:
      return 'now';
  }
}
