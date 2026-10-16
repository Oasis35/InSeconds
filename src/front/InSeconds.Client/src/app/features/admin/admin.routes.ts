import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AdminTab } from './admin.models';

const TABS: ReadonlySet<AdminTab> = new Set<AdminTab>(['dashboard', 'defis', 'pool', 'joueurs', 'actions']);

function isAdminTab(value: unknown): value is AdminTab {
  return TABS.has(value as AdminTab);
}

/**
 * Onglets de l'admin = routes enfants (`/admin/pool`, …) : l'onglet ouvert survit au F5 et se
 * partage par lien. Chaque onglet porte son nom dans `data.tab` (lu par AdminStateService).
 * Les composants restent rendus dans le `<router-outlet>` d'AdminComponent, donc ils voient
 * toujours les services fournis par AdminComponent.
 */
export const adminRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    // Anciennes adresses `/admin?tab=pool` (avant les routes enfants) : renvoyées vers `/admin/pool`.
    redirectTo: ({ queryParams }) =>
      inject(Router).createUrlTree(['/admin', isAdminTab(queryParams['tab']) ? queryParams['tab'] : 'dashboard']),
  },
  {
    path: 'dashboard',
    data: { tab: 'dashboard' },
    loadComponent: () => import('./components/dashboard-tab/dashboard-tab.component').then(m => m.DashboardTabComponent),
  },
  {
    path: 'defis',
    data: { tab: 'defis' },
    loadComponent: () => import('./components/challenges-tab/challenges-tab.component').then(m => m.ChallengesTabComponent),
  },
  {
    path: 'pool',
    data: { tab: 'pool' },
    loadComponent: () => import('./components/pool-tab/pool-tab.component').then(m => m.PoolTabComponent),
  },
  {
    path: 'joueurs',
    data: { tab: 'joueurs' },
    loadComponent: () => import('./components/players-tab/players-tab.component').then(m => m.PlayersTabComponent),
  },
  {
    path: 'actions',
    data: { tab: 'actions' },
    loadComponent: () => import('./components/actions-tab/actions-tab.component').then(m => m.ActionsTabComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
