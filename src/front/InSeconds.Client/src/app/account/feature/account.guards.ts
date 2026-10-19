import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from '../../core/session/session.store';
import { SessionLoader } from '../data-access/session-loader';

/**
 * Réserve une route aux comptes : un invité ou un visiteur est renvoyé vers la connexion. Attend
 * que l'identité soit lue (la première lecture est lancée au démarrage de l'app).
 */
export const linkedAccountGuard: CanActivateFn = async () => {
  // Les dépendances se résolvent avant le premier `await` : après lui, le contexte d'injection n'existe plus.
  const loader = inject(SessionLoader);
  const session = inject(SessionStore);
  const router = inject(Router);

  await loader.ensureLoaded();
  return session.isLinked() || router.createUrlTree(['/account/login']);
};
