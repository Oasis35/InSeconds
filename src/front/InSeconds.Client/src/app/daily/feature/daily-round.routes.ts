import { Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { DailyPage } from './daily/daily.page';
import { leaveGameGuard } from './leave-game.guard';

/**
 * La manche du jour (`/daily`), chargée à la demande au clic sur « Commencer » : seule route du jeu du jour qui fournit le lecteur audio,
 * la forme d'onde et l'autocomplétion du catalogue (`provideGameplay()`). L'accueil n'en embarque rien. Les stores de la manche
 * (`DailyRoundStore`, `TrackRoundStore`) sont ceux de la page : ils disparaissent avec elle.
 */
export const DAILY_ROUND_ROUTES: Routes = [
  {
    path: '',
    providers: [provideGameplay()],
    component: DailyPage,
    canDeactivate: [leaveGameGuard],
  },
];
