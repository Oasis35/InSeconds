import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideDailyApi } from '../data-access/daily.providers';

/**
 * Ce que le domaine `daily` branche dans l'app dès le démarrage : l'adresse de l'API du jeu du jour. Posée à la racine, le client généré étant un
 * singleton de la racine qui y lit son adresse. Le lecteur (`provideGameplay()`) est, lui, fourni par la route : Howler reste dans le morceau
 * chargé à la demande.
 */
export function provideDaily(): EnvironmentProviders {
  return makeEnvironmentProviders([provideDailyApi()]);
}
