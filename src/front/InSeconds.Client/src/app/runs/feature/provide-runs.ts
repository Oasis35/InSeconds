import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { HOME_MODE_ENTRIES } from '../../core/shell/home-mode-entries/home-mode-entries';

/**
 * Ce que le domaine `runs` branche dans l'app dès le démarrage : son entrée sur l'accueil du jeu du jour (la carte Platines), chargée à la
 * demande. Rien d'autre : le client de l'API et le lecteur sont fournis par la route `/runs` et par l'entrée elle-même.
 */
export function provideRuns(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => import('./home-entry/runs-home-entry.component').then(m => m.RunsHomeEntryComponent) } },
  ]);
}
