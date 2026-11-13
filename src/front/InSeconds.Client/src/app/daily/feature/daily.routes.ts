import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { DailyApi } from '../data-access/daily.api';
import { provideDailyApi } from '../data-access/daily.providers';
import { ArchivePage } from './archive/archive.page';
import { DailyPage } from './daily/daily.page';
import { DailyHistoryPage } from './history/daily-history.page';
import { leaveGameGuard } from './leave-game.guard';

/** `/history/daily/latest` : les réponses du jour publié le plus récent, la veille d'ordinaire ; sans jour publié, le jeu du jour. */
export const latestArchiveGuard: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    const [latest] = await inject(DailyApi).archiveDates();
    return router.createUrlTree(latest ? ['/history/daily', latest] : ['/daily']);
  } catch {
    return router.createUrlTree(['/daily']);
  }
};

/**
 * Le jeu du jour, chargé à la demande avec son client d'API et son lecteur, qui ne sont jamais chargés pour les autres pages. Sert la racine
 * (`/`, l'accueil) comme `/daily` (le défi) : `app.routes.ts` les range sous la même route, donc la même page, qui garde sa partie quand
 * l'adresse passe de l'une à l'autre. La page fournit ses stores.
 */
export const DAILY_ROUTES: Routes = [
  {
    path: '',
    providers: [provideDailyApi()],
    children: [{ path: '', providers: [provideGameplay()], component: DailyPage, canDeactivate: [leaveGameGuard] }],
  },
];

/**
 * L'historique du joueur sur le défi du jour (`/history/daily`) et les réponses d'un jour passé (`/history/daily/aaaa-mm-jj`, sans lecteur ;
 * `/history/daily/latest` ouvre le dernier jour publié). L'historique des setlists est la page du mode (`/history/setlist`).
 */
export const DAILY_HISTORY_ROUTES: Routes = [
  {
    path: '',
    providers: [provideDailyApi()],
    children: [
      { path: '', pathMatch: 'full', component: DailyHistoryPage },
      { path: 'latest', pathMatch: 'full', canActivate: [latestArchiveGuard], children: [] },
      { path: ':date', component: ArchivePage },
    ],
  },
];
