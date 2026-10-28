import { CanDeactivateFn } from '@angular/router';
import { RunsPage } from './runs/runs.page';

/** Quitter la page en pleine manche demande confirmation : la partie reste reprenable, mais on ne la perd pas par un clic de travers. */
export const leaveRunGuard: CanDeactivateFn<RunsPage> = page => page.canLeave();
