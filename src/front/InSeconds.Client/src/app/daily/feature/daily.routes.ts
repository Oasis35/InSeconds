import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { provideGameplay } from '../../gameplay/feature/provide-gameplay';
import { DailyApi } from '../data-access/daily.api';
import { ArchivePage } from './archive.page';
import { DailyPage } from './daily.page';
import { leaveGameGuard } from './leave-game.guard';

/** `/daily/archive` (l'icône du pied de page) : les réponses du jour publié le plus récent, la veille d'ordinaire ; sans jour publié, le jeu du jour. */
export const latestArchiveGuard: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    const [latest] = await inject(DailyApi).archiveDates();
    return router.createUrlTree(latest ? ['/daily/archive', latest] : ['/daily']);
  } catch {
    return router.createUrlTree(['/daily']);
  }
};

/**
 * Le jeu du jour, chargé à la demande avec son lecteur, qui n'est jamais chargé pour les autres pages. La page fournit ses stores. Les réponses
 * des jours passés (`archive/aaaa-mm-jj`) n'ont pas de lecteur.
 */
export const DAILY_ROUTES: Routes = [
  { path: 'archive', pathMatch: 'full', canActivate: [latestArchiveGuard], children: [] },
  { path: 'archive/:date', component: ArchivePage },
  { path: '', providers: [provideGameplay()], component: DailyPage, canDeactivate: [leaveGameGuard] },
];
