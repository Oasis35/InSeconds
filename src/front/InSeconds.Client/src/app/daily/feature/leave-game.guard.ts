import { CanDeactivateFn } from '@angular/router';
import { DailyPage } from './daily/daily.page';

/**
 * Quitter la page en cours de partie demande confirmation (aussi vers l'accueil, le logo ou le retour arrière) : la partie reste
 * reprenable, l'accueil montre alors la carte de reprise, mais on ne la perd pas par un clic de travers.
 */
export const leaveGameGuard: CanDeactivateFn<DailyPage> = page => page.canLeave();
