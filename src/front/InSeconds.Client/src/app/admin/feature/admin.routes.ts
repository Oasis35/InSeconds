import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { provideAdminApi } from '../data-access/admin-api.providers';
import { AdminShellPage } from './admin-shell/admin-shell.page';
import { DEFAULT_TAB, LEGACY_TAB_NAMES } from './admin-tabs';

/**
 * `/admin` n'a pas de contenu : il mène à l'onglet d'arrivée (l'accueil, `dashboard`). Les anciennes adresses
 * `/admin?tab=…` sont redirigées vers l'onglet demandé, le pool s'appelant `catalogue` et l'ancien onglet Actions
 * menant aux Morceaux, où le réglage du cooldown a été replié.
 */
const defaultTab: RedirectFunction = ({ queryParams }) => {
  const { tab, ...others } = queryParams;
  return inject(Router).createUrlTree(['/admin', legacyTabTarget(tab)], { queryParams: others });
};

/** L'onglet où mène un ancien `?tab=` : le catalogue pour `pool` et `actions`, l'onglet du même nom s'il existe, sinon l'onglet d'arrivée. */
function legacyTabTarget(tab: unknown): string {
  if (tab === 'pool' || tab === 'actions') return 'catalogue';
  if (tab === 'defis') return DEFAULT_TAB;
  if (typeof tab === 'string' && LEGACY_TAB_NAMES.has(tab)) return tab;
  return DEFAULT_TAB;
}

/** L'ancienne adresse `/admin/pool` mène au catalogue, page de la grille comprise. */
const poolToCatalogue: RedirectFunction = ({ queryParams, fragment }) =>
  inject(Router).createUrlTree(['/admin/catalogue'], { queryParams, fragment: fragment ?? undefined });

/** L'ancien onglet Défis n'existe plus : ses défis sont dans l'accueil (le calendrier de la date, le tableau du mois). Un `?mois=aaaa-mm` s'ouvre sur le dernier jour de l'accueil, sans jour précis. */
const challengesToDashboard: RedirectFunction = () => inject(Router).createUrlTree(['/admin', DEFAULT_TAB]);

/** L'ancien onglet Actions n'existe plus : son réglage (le cooldown) est en tête des Morceaux, ses témoins dans le panneau technique. */
const actionsToCatalogue: RedirectFunction = () => inject(Router).createUrlTree(['/admin/catalogue']);

/** Un onglet inconnu (`/admin/nimporte`) mène à l'onglet d'arrivée. */
const unknownTab: RedirectFunction = () => inject(Router).createUrlTree(['/admin', DEFAULT_TAB]);

/** Routes du domaine `admin`, chargées à la demande (`/admin/...`) avec les clients de l'API. Chaque page fournit ses stores. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellPage,
    providers: [provideAdminApi()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: defaultTab },
      { path: 'pool', pathMatch: 'full', redirectTo: poolToCatalogue },
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.page').then(m => m.DashboardPage) },
      { path: 'defis', pathMatch: 'full', redirectTo: challengesToDashboard },
      { path: 'catalogue', loadComponent: () => import('./pool/catalogue.page').then(m => m.CataloguePage) },
      { path: 'themes', loadComponent: () => import('./themes/themes.page').then(m => m.ThemesPage) },
      { path: 'a-valider', loadComponent: () => import('./candidates/candidates.page').then(m => m.CandidatesPage) },
      { path: 'stats', loadComponent: () => import('./stats/stats.page').then(m => m.StatsPage) },
      { path: 'groupes', loadComponent: () => import('./groups/groups.page').then(m => m.GroupsPage) },
      { path: 'joueurs', loadComponent: () => import('./players/players.page').then(m => m.PlayersPage) },
      { path: 'actions', pathMatch: 'full', redirectTo: actionsToCatalogue },
      { path: '**', redirectTo: unknownTab },
    ],
  },
];
