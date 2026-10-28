import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CATALOGUE_API_BASE_URL, CatalogueClient } from '../../api/catalogue/api.generated';
import { environment } from '../../../environments/environment';
import { AnswerSearchPort } from './answer-search.port';
import { AudioPort } from './audio.port';
import { CatalogueAnswerSearch } from './catalogue-answer-search';
import { HtmlAudioPort } from './html-audio.port';

/**
 * Ce que la manche branche dans l'app, par la route du mode : le lecteur (élément audio), l'autocomplete (catalogue), son client généré et
 * l'adresse de l'API qu'il lit (vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`). Le client est redonné ici : celui de la racine
 * n'aurait pas d'adresse, qui n'y est pas fournie pour garder ce client hors du bundle initial.
 */
export function provideGameplayPorts(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CATALOGUE_API_BASE_URL, useValue: environment.apiUrl },
    CatalogueClient,
    { provide: AudioPort, useClass: HtmlAudioPort },
    { provide: AnswerSearchPort, useClass: CatalogueAnswerSearch },
  ]);
}
