import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CATALOGUE_API_BASE_URL } from '../../api/catalogue/api.generated';
import { environment } from '../../../environments/environment';
import { AnswerSearchPort } from './answer-search.port';
import { AudioPort } from './audio.port';
import { CatalogueAnswerSearch } from './catalogue-answer-search';
import { HowlerAudioPort } from './howler-audio.port';

/**
 * Ce que la manche branche dans l'app : le lecteur (Howler), l'autocomplete (catalogue) et
 * l'adresse de l'API pour le client généré (vide en dev et en E2E : le proxy d'`ng serve` relaie `/api`).
 */
export function provideGameplayPorts(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: CATALOGUE_API_BASE_URL, useValue: environment.apiUrl },
    { provide: AudioPort, useClass: HowlerAudioPort },
    { provide: AnswerSearchPort, useClass: CatalogueAnswerSearch },
  ]);
}
