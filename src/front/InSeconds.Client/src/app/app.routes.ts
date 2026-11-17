import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes, UrlMatchResult, UrlSegment } from '@angular/router';

/**
 * Redirection qui garde la query string et le fragment : un lien magique
 * (`/login/verify?token=…`) ou l'avis d'ancienne adresse (`?from=legacy`) survivent au passage
 * vers les routes actuelles.
 */
export function redirectKeepingQuery(target: string): RedirectFunction {
  return ({ queryParams, fragment }) =>
    inject(Router).createUrlTree([target], { queryParams, fragment: fragment ?? undefined });
}

/** `/runs/<code>` et `/setlist/<code>` deviennent `/survie/<code>` : les liens d'ami déjà envoyés restent valables, query string et fragment gardés. */
export const redirectRunsLink: RedirectFunction = ({ params, queryParams, fragment }) =>
  inject(Router).createUrlTree(['/survie', params['code']], { queryParams, fragment: fragment ?? undefined });

/**
 * La racine (l'accueil) et `/daily` (le défi) vont au même domaine, qui a deux pages sous une coquille commune : le matcher n'en consomme pas
 * le chemin, ce sont ses routes enfants (`''` et `daily`) qui le lisent. Sans l'accès Survie, la racine renvoie à `/daily` (la coquille s'en charge).
 */
export function homeOrDailyMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  return segments.length === 0 || segments[0].path === 'daily' ? { consumed: [] } : null;
}

/** `/daily/archive/<jour>` et `/setlist/history/<partie>` : mêmes pages sous `/history`, query string et fragment gardés. */
export function redirectHistoryLink(base: string): RedirectFunction {
  return ({ params, queryParams, fragment }) =>
    inject(Router).createUrlTree([base, params['date'] ?? params['id']], { queryParams, fragment: fragment ?? undefined });
}

export const routes: Routes = [

  // Anciennes adresses : tous les liens existants (partages, favoris, emails) restent valables.
  { path: 'blindtest', pathMatch: 'full', redirectTo: redirectKeepingQuery('/daily') },
  { path: 'login', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/login') },
  { path: 'login/verify', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/login/verify') },
  { path: 'profile', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/profile') },
  { path: 'profile/confirm-email', pathMatch: 'full', redirectTo: redirectKeepingQuery('/account/confirm-email') },
  { path: 'confidentialite', pathMatch: 'full', redirectTo: redirectKeepingQuery('/privacy') },
  { path: 'mentions-legales', pathMatch: 'full', redirectTo: redirectKeepingQuery('/legal') },
  { path: 'legal-notice', pathMatch: 'full', redirectTo: redirectKeepingQuery('/legal') },
  // Le mode Run s'appelle Survie à l'écran (ex-Setlist, ex-Platines) : les anciennes adresses et les liens déjà partagés suivent.
  { path: 'runs', pathMatch: 'full', redirectTo: redirectKeepingQuery('/survie') },
  { path: 'runs/:code', pathMatch: 'full', redirectTo: redirectRunsLink },
  { path: 'setlist', pathMatch: 'full', redirectTo: redirectKeepingQuery('/survie') },
  { path: 'setlist/hits', pathMatch: 'full', redirectTo: redirectKeepingQuery('/survie/hits') },
  // L'historique et les réponses des jours passés sont sous `/history`, un onglet de la barre du bas.
  { path: 'daily/history', pathMatch: 'full', redirectTo: redirectKeepingQuery('/history/daily') },
  { path: 'daily/archive', pathMatch: 'full', redirectTo: redirectKeepingQuery('/history/daily/latest') },
  { path: 'daily/archive/:date', pathMatch: 'full', redirectTo: redirectHistoryLink('/history/daily') },
  { path: 'setlist/history', pathMatch: 'full', redirectTo: redirectKeepingQuery('/history/survie') },
  { path: 'setlist/history/:id', pathMatch: 'full', redirectTo: redirectHistoryLink('/history/survie') },
  { path: 'setlist/:code', pathMatch: 'full', redirectTo: redirectRunsLink },
  { path: 'history/setlist', pathMatch: 'full', redirectTo: redirectKeepingQuery('/history/survie') },
  { path: 'history/setlist/:id', pathMatch: 'full', redirectTo: redirectHistoryLink('/history/survie') },

  // Domaines : chacun remplace sa page d'attente par ses routes (chargées à la demande, avec leurs stores).
  { matcher: homeOrDailyMatcher, loadChildren: () => import('./daily/feature/daily.routes').then(m => m.DAILY_ROUTES) },
  { path: 'history', pathMatch: 'full', redirectTo: redirectKeepingQuery('/history/daily') },
  { path: 'history/daily', loadChildren: () => import('./daily/feature/daily.routes').then(m => m.DAILY_HISTORY_ROUTES) },
  { path: 'history/survie', loadChildren: () => import('./runs/feature/runs.routes').then(m => m.RUNS_HISTORY_ROUTES) },
  { path: 'survie', loadChildren: () => import('./runs/feature/runs.routes').then(m => m.RUNS_ROUTES) },
  { path: 'ranking', loadChildren: () => import('./social/feature/social.routes').then(m => m.SOCIAL_ROUTES) },
  { path: 'account', loadChildren: () => import('./account/feature/account.routes').then(m => m.ACCOUNT_ROUTES) },
  { path: 'admin', loadChildren: () => import('./admin/feature/admin.routes').then(m => m.ADMIN_ROUTES) },
  { path: 'legal', loadComponent: () => import('./core/shell/legal/legal.page').then(m => m.LegalPage) },
  { path: 'privacy', loadComponent: () => import('./core/shell/privacy/privacy.page').then(m => m.PrivacyPage) },

  {
    path: '**',
    loadComponent: () => import('./core/shell/not-found/not-found.page').then(m => m.NotFoundPage),
  },
];
