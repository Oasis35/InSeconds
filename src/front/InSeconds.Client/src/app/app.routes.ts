import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';

/**
 * Redirection qui garde la query string et le fragment : un lien magique
 * (`/login/verify?token=…`) ou l'avis d'ancienne adresse (`?from=legacy`) survivent au passage
 * vers les routes actuelles.
 */
export function redirectKeepingQuery(target: string): RedirectFunction {
  return ({ queryParams, fragment }) =>
    inject(Router).createUrlTree([target], { queryParams, fragment: fragment ?? undefined });
}

/** `/runs/<code>` devient `/setlist/<code>` : les liens d'ami déjà envoyés restent valables, query string et fragment gardés. */
export const redirectRunsLink: RedirectFunction = ({ params, queryParams, fragment }) =>
  inject(Router).createUrlTree(['/setlist', params['code']], { queryParams, fragment: fragment ?? undefined });

export const routes: Routes = [
  // Tant que le mode Runs n'est pas public, l'accueil est le défi du jour.
  { path: '', pathMatch: 'full', redirectTo: redirectKeepingQuery('/daily') },

  // Anciennes adresses : tous les liens existants (partages, favoris, emails) restent valables.
  { path: 'blindtest', pathMatch: 'full', redirectTo: redirectKeepingQuery('/daily') },
  { path: 'login', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/login') },
  { path: 'login/verify', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/login/verify') },
  { path: 'profile', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/profile') },
  { path: 'profile/confirm-email', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/confirm-email') },
  { path: 'confidentialite', pathMatch: 'full', redirectTo: redirectKeepingQuery('/privacy') },
  { path: 'mentions-legales', pathMatch: 'full', redirectTo: redirectKeepingQuery('/legal') },
  { path: 'legal-notice', pathMatch: 'full', redirectTo: redirectKeepingQuery('/legal') },
  // Le mode Run s'appelle Setlist à l'écran (ex-Platines) : l'ancienne adresse et les liens déjà partagés suivent.
  { path: 'runs', pathMatch: 'full', redirectTo: redirectKeepingQuery('/setlist') },
  { path: 'runs/:code', pathMatch: 'full', redirectTo: redirectRunsLink },

  // Domaines : chacun remplace sa page d'attente par ses routes (chargées à la demande, avec leurs stores).
  { path: 'daily', loadChildren: () => import('./daily/feature/daily.routes').then(m => m.DAILY_ROUTES) },
  { path: 'setlist', loadChildren: () => import('./runs/feature/runs.routes').then(m => m.RUNS_ROUTES) },
  { path: 'account', loadChildren: () => import('./account/feature/account.routes').then(m => m.ACCOUNT_ROUTES) },
  { path: 'admin', loadChildren: () => import('./admin/feature/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'legal', loadComponent: () => import('./core/shell/legal/legal.page').then(m => m.LegalPage) },
  { path: 'privacy', loadComponent: () => import('./core/shell/privacy/privacy.page').then(m => m.PrivacyPage) },

  {
    path: '**',
    loadComponent: () => import('./core/shell/not-found/not-found.page').then(m => m.NotFoundPage),
  },
];
