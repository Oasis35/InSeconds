import { Routes } from '@angular/router';
import { environment } from '../environments/environment';

export const routes: Routes = [
  {
    path: 'game',
    loadComponent: () =>
      import('./features/game/game.component').then(m => m.GameComponent),
  },
  ...(environment.production ? [] : [{
    path: 'admin',
    loadComponent: () =>
      import('./features/admin/admin.component').then(m => m.AdminComponent),
  }]),
  { path: '', redirectTo: 'game', pathMatch: 'full' },
];
