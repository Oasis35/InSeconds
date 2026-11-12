import { Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { provideRunsApi } from '../data-access/runs.providers';
import { RunHistoryDetailPage } from './history-detail/run-history-detail.page';
import { RunHistoryPage } from './history/run-history.page';
import { leaveRunGuard } from './leave-run.guard';
import { RunsPage } from './runs/runs.page';

/**
 * Le mode Run, chargé à la demande avec son lecteur et son client d'API, qui ne sont jamais chargés pour les autres pages. La page fournit ses
 * stores ; `/setlist/<code>` est le lien d'un ami (sans accès sur invitation : il suffit d'avoir le lien) ; l'accès sur invitation est vérifié par le serveur (sans accès, la page renvoie au jeu du jour), jamais par un garde du front.
 */
export const RUNS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideRunsApi(), provideGameplay()],
    children: [
      { path: '', component: RunsPage, canDeactivate: [leaveRunGuard] },
      // L'historique du joueur (V4) et les morceaux d'une de ses parties finies ; avant `:code`, qui prendrait « history » pour un lien.
      { path: 'history', component: RunHistoryPage },
      { path: 'history/:id', component: RunHistoryDetailPage },
      // Le lien d'une playlist : lien reçu, reprise ou comparaison selon la partie du joueur (le serveur décide).
      { path: ':code', component: RunsPage, canDeactivate: [leaveRunGuard] },
    ],
  },
];
