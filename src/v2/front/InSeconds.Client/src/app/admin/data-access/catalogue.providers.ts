import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CATALOGUE_API_BASE_URL } from '../../api/catalogue/api.generated';
import { environment } from '../../../environments/environment';

/** Adresse de l'API pour le client généré du catalogue (vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`). */
export function provideCatalogueApi(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: CATALOGUE_API_BASE_URL, useValue: environment.apiUrl }]);
}
