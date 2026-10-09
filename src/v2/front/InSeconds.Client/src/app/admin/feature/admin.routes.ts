import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { AdminShellPage } from './admin-shell.page';
import { DEFAULT_TAB, LEGACY_TAB_NAMES } from './admin-tabs';

/**
 * `/admin` n'a pas de contenu : il mène à l'onglet d'arrivée (le tableau de bord). Les anciennes adresses
 * `/admin?tab=…` (v1) sont redirigées vers l'onglet demandé, le pool s'appelant désormais `catalogue`.
 */
const defaultTab: RedirectFunction = ({ queryParams }) => {
  const { tab, ...others } = queryParams;
  const target = tab === 'pool' ? 'catalogue' : typeof tab === 'string' && LEGACY_TAB_NAMES.has(tab) ? tab : DEFAULT_TAB;
  return inject(Router).createUrlTree(['/admin', target], { queryParams: others });
};

/** L'ancienne adresse `/admin/pool` mène au catalogue, page de la grille comprise. */
const poolToCatalogue: RedirectFunction = ({ queryParams, fragment }) =>
  inject(Router).createUrlTree(['/admin/catalogue'], { queryParams, fragment: fragment ?? undefined });

/** Un onglet inconnu (`/admin/nimporte`) mène à l'onglet d'arrivée. */
const unknownTab: RedirectFunction = () => inject(Router).createUrlTree(['/admin', DEFAULT_TAB]);

/** Routes du domaine `admin`, chargées à la demande (`/admin/...`). Chaque page fournit ses stores. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellPage,
    children: [
      { path: '', pathMatch: 'full', redirectTo: defaultTab },
      { path: 'pool', pathMatch: 'full', redirectTo: poolToCatalogue },
      { path: 'dashboard', loadComponent: () => import('./dashboard.page').then(m => m.DashboardPage) },
      { path: 'defis', loadComponent: () => import('./challenges.page').then(m => m.ChallengesPage) },
      { path: 'catalogue', loadComponent: () => import('./catalogue.page').then(m => m.CataloguePage) },
      { path: 'joueurs', loadComponent: () => import('./players.page').then(m => m.PlayersPage) },
      { path: 'actions', loadComponent: () => import('./actions.page').then(m => m.ActionsPage) },
      { path: '**', redirectTo: unknownTab },
    ],
  },
];
