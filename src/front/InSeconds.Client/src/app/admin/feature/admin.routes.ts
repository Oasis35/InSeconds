import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { provideAdminRunsApi } from '../data-access/admin-runs-api.providers';
import { AdminShellPage } from './admin-shell/admin-shell.page';
import { DEFAULT_TAB, LEGACY_TAB_NAMES } from './admin-tabs';

/**
 * `/admin` n'a pas de contenu : il mène à l'onglet d'arrivée (le tableau de bord). Les anciennes adresses
 * `/admin?tab=…` (v1) sont redirigées vers l'onglet demandé, le pool s'appelant désormais `catalogue`.
 */
const defaultTab: RedirectFunction = ({ queryParams }) => {
  const { tab, ...others } = queryParams;
  return inject(Router).createUrlTree(['/admin', legacyTabTarget(tab)], { queryParams: others });
};

/** L'onglet où mène un ancien `?tab=` : le catalogue pour `pool`, l'onglet du même nom s'il existe, sinon l'onglet d'arrivée. */
function legacyTabTarget(tab: unknown): string {
  if (tab === 'pool') return 'catalogue';
  if (typeof tab === 'string' && LEGACY_TAB_NAMES.has(tab)) return tab;
  return DEFAULT_TAB;
}

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
    providers: [provideAdminRunsApi()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: defaultTab },
      { path: 'pool', pathMatch: 'full', redirectTo: poolToCatalogue },
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.page').then(m => m.DashboardPage) },
      { path: 'defis', loadComponent: () => import('./challenges/challenges.page').then(m => m.ChallengesPage) },
      { path: 'catalogue', loadComponent: () => import('./pool/catalogue.page').then(m => m.CataloguePage) },
      { path: 'joueurs', loadComponent: () => import('./players/players.page').then(m => m.PlayersPage) },
      { path: 'actions', loadComponent: () => import('./actions/actions.page').then(m => m.ActionsPage) },
      { path: '**', redirectTo: unknownTab },
    ],
  },
];
