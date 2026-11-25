import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, Routes } from '@angular/router';
import { DailyApi } from '../data-access/daily.api';
import { provideDailyApi } from '../data-access/daily.providers';
import { ArchivePage } from './archive/archive.page';
import { DailyShellComponent } from './daily-shell/daily-shell.component';
import { HomePage } from './home/home.page';
import { DailyHistoryPage } from './history/daily-history.page';
import { EarProfilePage } from './ear-profile/ear-profile.page';
import { ReplayPage } from './replay/replay.page';
import { isStartIntent } from './daily-shell/daily-launcher';

/** `/history/daily/latest` : les réponses du jour publié le plus récent, la veille d'ordinaire ; sans jour publié, le jeu du jour. */
export const latestArchiveGuard: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    const [latest] = await inject(DailyApi).archiveDates();
    return router.createUrlTree(latest ? ['/history/daily', latest] : ['/']);
  } catch {
    return router.createUrlTree(['/']);
  }
};

/**
 * `/daily` n'existe que pour un joueur qui vient de cliquer sur « Commencer » ou « Reprendre » (l'intention est dans l'état de la navigation,
 * `START_INTENT`). Sans elle (favori, rechargement en pleine manche, lien partagé, retour arrière), on retourne à l'accueil, qui lit l'état du
 * jour et montre la carte du défi ou de la pause : jamais de partie ni de son sans clic. Évalué avant le chargement du code de la manche.
 */
export const startIntentGuard: CanMatchFn = () => {
  const router = inject(Router);
  const navigation = router.currentNavigation();
  if (isStartIntent(navigation?.extras.info)) return true;
  return router.createUrlTree(['/'], { queryParams: navigation?.initialUrl.queryParams });
};

/**
 * Le jeu du jour, chargé à la demande avec son client d'API. Sert l'accueil (`/`, l'état du jour : carte du défi, pause, résultat) sous une
 * coquille (`DailyShellComponent`) qui porte l'état du jour (`HomeStore`) ; la manche (`/daily`) est une route enfant chargée à la demande
 * (`DAILY_ROUND_ROUTES`, avec le lecteur et le reste de `gameplay`), que l'accueil n'embarque donc pas. `app.routes.ts` envoie les deux
 * adresses ici sans en consommer le chemin.
 */
export const DAILY_ROUTES: Routes = [
  {
    path: '',
    providers: [provideDailyApi()],
    component: DailyShellComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomePage },
      {
        path: 'daily',
        pathMatch: 'full',
        canMatch: [startIntentGuard],
        loadChildren: () => import('./daily-round.routes').then(m => m.DAILY_ROUND_ROUTES),
      },
    ],
  },
];

/**
 * L'historique du joueur sur le défi du jour (`/history/daily`), « À réécouter » (`a-reecouter`), son profil d'oreille (`profil`) et les
 * réponses d'un jour passé (`/history/daily/aaaa-mm-jj`, sans lecteur de manche ;
 * `/history/daily/latest` ouvre le dernier jour publié). L'historique des setlists est la page du mode (`/history/survie`).
 */
export const DAILY_HISTORY_ROUTES: Routes = [
  {
    path: '',
    providers: [provideDailyApi()],
    children: [
      { path: '', pathMatch: 'full', component: DailyHistoryPage },
      { path: 'latest', pathMatch: 'full', canActivate: [latestArchiveGuard], children: [] },
      // Avant `:date`, qui les prendrait pour un jour.
      { path: 'a-reecouter', pathMatch: 'full', component: ReplayPage },
      { path: 'profil', pathMatch: 'full', component: EarProfilePage },
      { path: ':date', component: ArchivePage },
    ],
  },
];
