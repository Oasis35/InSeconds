import { CanDeactivateFn } from '@angular/router';
import { DailyPage } from './daily/daily.page';

/**
 * Quitter la page en cours de partie demande confirmation : la partie reste reprenable, mais on ne la perd pas par un clic de travers.
 * Vers `/` (le logo), rien ne se passe : la coque renverrait de toute façon sur la manche, la confirmation ne servirait à rien.
 */
export const leaveGameGuard: CanDeactivateFn<DailyPage> = (page, _route, _state, next) => {
  if (page.isPlaying() && next.url.split(/[?#]/)[0] === '/') return false;
  return page.canLeave();
};
