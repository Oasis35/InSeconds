import { Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { DailyPage } from './daily.page';
import { leaveGameGuard } from './leave-game.guard';

/**
 * Le jeu du jour, chargé à la demande avec son lecteur : Howler (CommonJS, lourd) reste dans ce morceau et n'est jamais chargé pour les
 * autres pages. La page fournit ses stores.
 */
export const DAILY_ROUTES: Routes = [
  { path: '', providers: [provideGameplay()], component: DailyPage, canDeactivate: [leaveGameGuard] },
];
