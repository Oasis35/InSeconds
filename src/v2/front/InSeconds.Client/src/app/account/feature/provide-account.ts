import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { providePlayersApi } from '../data-access/players.providers';
import { SessionLoader } from '../data-access/session-loader';

/**
 * Ce que le domaine `account` branche dans l'app dès le démarrage : l'adresse de l'API des joueurs
 * et la lecture de l'identité (`GET /api/players/me`). La lecture n'est pas attendue : l'affichage
 * ne dépend pas d'elle, seules les routes réservées aux comptes l'attendent (`linkedAccountGuard`).
 */
export function provideAccount(): EnvironmentProviders {
  return makeEnvironmentProviders([
    providePlayersApi(),
    provideAppInitializer(() => {
      void inject(SessionLoader).ensureLoaded();
    }),
  ]);
}
