import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideGameplayPorts } from '../data-access/gameplay.providers';

/** Ce que le domaine `gameplay` branche dans l'app : le lecteur Howler, l'autocomplete du catalogue, l'adresse de l'API. */
export function provideGameplay(): EnvironmentProviders {
  return makeEnvironmentProviders([provideGameplayPorts()]);
}
