import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';

/**
 * Redirection qui garde la query string et le fragment : un lien magique
 * (`/login/verify?token=…`) ou l'avis d'ancienne adresse (`?from=legacy`) survivent au passage
 * vers les routes v2 (§ 6.6 du plan v2).
 */
export function redirectKeepingQuery(target: string): RedirectFunction {
  return ({ queryParams, fragment }) =>
    inject(Router).createUrlTree([target], { queryParams, fragment: fragment ?? undefined });
}

const comingSoon = () => import('./core/shell/coming-soon/coming-soon.page').then(m => m.ComingSoonPage);

export const routes: Routes = [
  // Tant que le mode Runs n'est pas public, l'accueil est le défi du jour.
  { path: '', pathMatch: 'full', redirectTo: redirectKeepingQuery('/daily') },

  // Anciennes adresses de la v1 : tous les liens existants (partages, favoris, emails) restent valables.
  { path: 'blindtest', pathMatch: 'full', redirectTo: redirectKeepingQuery('/daily') },
  { path: 'login', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/login') },
  { path: 'login/verify', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/login/verify') },
  { path: 'profile', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/profile') },
  { path: 'profile/confirm-email', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/confirm-email') },
  { path: 'confidentialite', pathMatch: 'full', redirectTo: redirectKeepingQuery('/privacy') },
  { path: 'mentions-legales', pathMatch: 'full', redirectTo: redirectKeepingQuery('/privacy') },
  { path: 'legal-notice', pathMatch: 'full', redirectTo: redirectKeepingQuery('/privacy') },

  // Domaines : chacun remplace sa page d'attente par ses routes (chargées à la demande, avec leurs stores).
  { path: 'daily', loadComponent: comingSoon },
  { path: 'account', loadChildren: () => import('./account/feature/account.routes').then(m => m.ACCOUNT_ROUTES) },
  { path: 'admin', loadChildren: () => import('./admin/feature/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'privacy', loadComponent: comingSoon },

  {
    path: '**',
    loadComponent: () => import('./core/shell/not-found/not-found.page').then(m => m.NotFoundPage),
  },
];
