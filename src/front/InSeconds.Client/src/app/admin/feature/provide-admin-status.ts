import { EnvironmentProviders, Injector, effect, inject, makeEnvironmentProviders, provideAppInitializer, untracked } from '@angular/core';
import { SessionStore } from '../../core/session/session.store';

/**
 * Ce que le domaine `admin` branche dans l'app dès le démarrage : la lecture espacée du nombre d'alertes, pour le témoin du bouton « Admin »
 * de l'en-tête. Seule la question « ce compte est-il admin ? » reste au démarrage : le lecteur (`AdminStatus`) se charge à la demande, pour un
 * admin seulement, si bien qu'aucun autre joueur ne télécharge ni n'exécute rien de plus (le bundle initial dépasse déjà son budget).
 */
export function provideAdminStatus(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const session = inject(SessionStore);
      const injector = inject(Injector);
      let started = false;
      effect(() => {
        // L'identité se lit au démarrage de l'app : tant qu'elle n'est pas connue, on ne conclut rien.
        if (started || !session.loaded() || !session.isAdmin()) return;
        started = true;
        untracked(() => void import('../data-access/admin-status').then(({ AdminStatus }) => injector.get(AdminStatus)));
      }, { injector });
    }),
  ]);
}
