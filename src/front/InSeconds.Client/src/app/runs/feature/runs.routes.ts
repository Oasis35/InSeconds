import { Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { provideRunsApi } from '../data-access/runs.providers';
import { leaveRunGuard } from './leave-run.guard';
import { RunsPage } from './runs.page';

/**
 * Le mode Run, chargé à la demande avec son lecteur et son client d'API, qui ne sont jamais chargés pour les autres pages. La page fournit ses
 * stores ; `/runs/<code>` est le lien d'un ami (sans accès sur invitation : il suffit d'avoir le lien) ; l'accès sur invitation est vérifié par le serveur (sans accès, la page renvoie au jeu du jour), jamais par un garde du front.
 */
export const RUNS_ROUTES: Routes = [
  {
    path: '',
    providers: [provideRunsApi(), provideGameplay()],
    children: [
      { path: '', component: RunsPage, canDeactivate: [leaveRunGuard] },
      // Le lien d'une playlist : lien reçu, reprise ou comparaison selon la partie du joueur (le serveur décide).
      { path: ':code', component: RunsPage, canDeactivate: [leaveRunGuard] },
    ],
  },
];
