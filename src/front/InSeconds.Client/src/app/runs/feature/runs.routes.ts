import { Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { provideRunsApi } from '../data-access/runs.providers';
import { provideSocialApi } from '../../social/data-access/social.providers';
import { RunHistoryDetailPage } from './history-detail/run-history-detail.page';
import { RunHistoryPage } from './history/run-history.page';
import { RunHitsPage } from './hits/run-hits.page';
import { leaveRunGuard } from './leave-run.guard';
import { RunsPage } from './runs/runs.page';

/**
 * Le mode Run, chargé à la demande avec son lecteur et son client d'API, qui ne sont jamais chargés pour les autres pages. La page fournit ses
 * stores ; `/setlist/<code>` est le lien d'un ami (sans accès sur invitation : il suffit d'avoir le lien) ; l'accès sur invitation est vérifié par le serveur (sans accès, la page renvoie au jeu du jour), jamais par un garde du front.
 */
export const RUNS_ROUTES: Routes = [
  {
    path: '',
    // Le client des groupes suit : la fin d'une partie montre les groupes du joueur et invite dans un groupe.
    providers: [provideRunsApi(), provideSocialApi(), provideGameplay()],
    children: [
      { path: '', component: RunsPage, canDeactivate: [leaveRunGuard] },
      // Les Hits du joueur ; avant `:code`, qui le prendrait pour un lien.
      { path: 'hits', component: RunHitsPage },
      // Le lien d'une playlist : lien reçu, reprise ou comparaison selon la partie du joueur (le serveur décide).
      { path: ':code', component: RunsPage, canDeactivate: [leaveRunGuard] },
    ],
  },
];

/** L'historique du joueur sur le mode (`/history/setlist`) et les morceaux d'une de ses parties finies (`/history/setlist/<partie>`). */
export const RUNS_HISTORY_ROUTES: Routes = [
  {
    path: '',
    providers: [provideRunsApi()],
    children: [
      { path: '', pathMatch: 'full', component: RunHistoryPage },
      { path: ':id', component: RunHistoryDetailPage },
    ],
  },
];
