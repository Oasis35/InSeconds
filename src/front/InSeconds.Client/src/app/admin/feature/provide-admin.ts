import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideAdminApi } from '../data-access/admin-api.providers';
import { provideCatalogueApi } from '../data-access/catalogue.providers';

/** Ce que le domaine `admin` branche dans l'app dès le démarrage : l'adresse de l'API (catalogue, jeu du jour, tâches). */
export function provideAdmin(): EnvironmentProviders {
  return makeEnvironmentProviders([provideCatalogueApi(), provideAdminApi()]);
}
