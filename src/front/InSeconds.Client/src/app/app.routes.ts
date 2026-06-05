import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/game/game.component').then(m => m.GameComponent),
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.component').then(m => m.AdminComponent),
  },
];
