import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { ArrivalSourceService } from '../data-access/arrival-source.service';
import { providePlayersApi } from '../data-access/players.providers';
import { SessionLoader } from '../data-access/session-loader';

/**
 * Ce que le domaine `account` branche dans l'app dès le démarrage : l'adresse de l'API des joueurs,
 * la source d'arrivée (lue avant que le routeur ne change l'adresse) et la lecture de l'identité
 * (`GET /api/players/me`). La lecture n'est pas attendue : l'affichage
 * ne dépend pas d'elle, seules les routes réservées aux comptes l'attendent (`linkedAccountGuard`).
 */
export function provideAccount(): EnvironmentProviders {
  return makeEnvironmentProviders([
    providePlayersApi(),
    provideAppInitializer(() => {
      inject(ArrivalSourceService).capture();
      void inject(SessionLoader).ensureLoaded();
    }),
  ]);
}
