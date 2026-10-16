import { CanDeactivateFn } from '@angular/router';
import { DailyPage } from './daily.page';

/** Quitter la page en cours de partie demande confirmation : la partie reste reprenable, mais on ne la perd pas par un clic de travers. */
export const leaveGameGuard: CanDeactivateFn<DailyPage> = page => page.canLeave();
