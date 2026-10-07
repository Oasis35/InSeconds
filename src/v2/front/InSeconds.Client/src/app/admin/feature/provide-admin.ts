import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideCatalogueApi } from '../data-access/catalogue.providers';

/** Ce que le domaine `admin` branche dans l'app dès le démarrage : l'adresse de l'API du catalogue. */
export function provideAdmin(): EnvironmentProviders {
  return makeEnvironmentProviders([provideCatalogueApi()]);
}
