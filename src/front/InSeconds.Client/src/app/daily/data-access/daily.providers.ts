import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { DAILY_API_BASE_URL } from '../../api/daily/api.generated';
import { environment } from '../../../environments/environment';

/** Adresse de l'API pour le client généré du jeu du jour (vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`). */
export function provideDailyApi(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: DAILY_API_BASE_URL, useValue: environment.apiUrl }]);
}
