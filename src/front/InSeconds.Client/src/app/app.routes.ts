import { Routes } from '@angular/router';
import { unsavedGameGuard } from './core/guards/unsaved-game.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/game/game.component').then(m => m.GameComponent),
    canDeactivate: [unsavedGameGuard],
  },
  {
    path: 'blindtest',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.component').then(m => m.AdminComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.component').then(m => m.NotFoundComponent),
  },
];
