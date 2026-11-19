import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { HOME_MODE_ENTRIES } from '../../core/shell/home-mode-entries/home-mode-entries';
import { SetlistAccessStore } from '../data-access/setlist-access.store';

/**
 * Ce que le domaine `runs` branche dans l'app dès le démarrage : son entrée sur l'accueil du jeu du jour (la carte Survie), chargée à la demande,
 * et la lecture de l'accès Survie. Le client de l'API et le lecteur sont fournis par la
 * route `/survie` et par les composants eux-mêmes.
 */
export function provideRuns(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => import('./home-entry/runs-home-entry.component').then(m => m.RunsHomeEntryComponent) } },
    provideAppInitializer(() => void inject(SetlistAccessStore)),
  ]);
}
