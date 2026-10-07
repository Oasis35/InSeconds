import { inject } from '@angular/core';
import { RedirectFunction, Router, Routes } from '@angular/router';
import { AdminShellPage } from './admin-shell.page';
import { TABS_TO_COME } from './admin-tabs';

/**
 * `/admin` n'a pas de contenu : il mène à un onglet. Les anciennes adresses `/admin?tab=…` (v1) sont
 * redirigées vers l'onglet demandé, le pool s'appelant désormais `catalogue`.
 */
const defaultTab: RedirectFunction = ({ queryParams }) => {
  const { tab, ...others } = queryParams;
  const target = typeof tab === 'string' && TABS_TO_COME.has(tab) ? tab : 'catalogue';
  return inject(Router).createUrlTree(['/admin', target], { queryParams: others });
};

/** L'ancienne adresse `/admin/pool` mène au catalogue, page de la grille comprise. */
const poolToCatalogue: RedirectFunction = ({ queryParams, fragment }) =>
  inject(Router).createUrlTree(['/admin/catalogue'], { queryParams, fragment: fragment ?? undefined });

const comingSoon = () => import('./tab-coming-soon.page').then(m => m.TabComingSoonPage);

/** Routes du domaine `admin`, chargées à la demande (`/admin/...`). Chaque page fournit ses stores. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellPage,
    children: [
      { path: '', pathMatch: 'full', redirectTo: defaultTab },
      { path: 'pool', pathMatch: 'full', redirectTo: poolToCatalogue },
      { path: 'catalogue', loadComponent: () => import('./catalogue.page').then(m => m.CataloguePage) },
      { path: '**', loadComponent: comingSoon },
    ],
  },
];
