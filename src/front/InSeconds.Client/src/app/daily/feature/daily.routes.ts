import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { DailyApi } from '../data-access/daily.api';
import { provideDailyApi } from '../data-access/daily.providers';
import { ArchivePage } from './archive/archive.page';
import { DailyShellComponent } from './daily-shell/daily-shell.component';
import { DailyPage } from './daily/daily.page';
import { HomePage } from './home/home.page';
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
 * Le jeu du jour, chargé à la demande avec son client d'API et son lecteur, qui ne sont jamais chargés pour les autres pages. Sert l'accueil
 * (`/`, neutre) et le défi (`/daily`, la manche) sous une même coquille (`DailyShellComponent`) qui porte la partie : on passe de l'une à
 * l'autre sans la perdre. `app.routes.ts` envoie les deux adresses ici sans en consommer le chemin.
 */
export const DAILY_ROUTES: Routes = [
  {
    path: '',
    providers: [provideDailyApi(), provideGameplay()],
    component: DailyShellComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomePage },
      { path: 'daily', pathMatch: 'full', component: DailyPage, canDeactivate: [leaveGameGuard] },
    ],
  },
];

/**
 * L'historique du joueur sur le défi du jour (`/history/daily`) et les réponses d'un jour passé (`/history/daily/aaaa-mm-jj`, sans lecteur ;
 * `/history/daily/latest` ouvre le dernier jour publié). L'historique des setlists est la page du mode (`/history/survie`).
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
