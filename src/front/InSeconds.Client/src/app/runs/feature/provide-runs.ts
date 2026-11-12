import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { BOTTOM_BAR_SLOT } from '../../core/shell/bottom-bar-slot/bottom-bar-slot';
import { HOME_MODE_ENTRIES } from '../../core/shell/home-mode-entries/home-mode-entries';
import { SetlistAccessStore } from '../data-access/setlist-access.store';

/**
 * Ce que le domaine `runs` branche dans l'app dès le démarrage : son entrée sur l'accueil du jeu du jour (la carte Setlist), la barre du bas de
 * la V4, toutes deux chargées à la demande, et la lecture de l'accès (le flag de la V4). Le client de l'API et le lecteur sont fournis par la
 * route `/setlist` et par les composants eux-mêmes.
 */
export function provideRuns(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => import('./home-entry/runs-home-entry.component').then(m => m.RunsHomeEntryComponent) } },
    { provide: BOTTOM_BAR_SLOT, useValue: { load: () => import('./v4-shell/setlist-bottom-bar.component').then(m => m.SetlistBottomBarComponent) } },
    provideAppInitializer(() => void inject(SetlistAccessStore)),
  ]);
}
