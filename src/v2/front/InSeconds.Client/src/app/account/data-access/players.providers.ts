import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { PLAYERS_API_BASE_URL } from '../../api/players/api.generated';
import { environment } from '../../../environments/environment';

/** Adresse de l'API pour le client généré des joueurs (vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`). */
export function providePlayersApi(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: PLAYERS_API_BASE_URL, useValue: environment.apiUrl }]);
}
