import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { HOME_MODE_ENTRIES } from '../../core/shell/home-mode-entries/home-mode-entries';

/**
 * Ce que le domaine `social` branche dans l'app au démarrage : la carte amis de l'accueil, chargée à la demande. À appeler avant `provideRuns()` :
 * l'ordre des entrées est celui des fournisseurs, et la carte Survie se pose sous la carte amis. Le client de l'API est fourni par la carte elle-même.
 */
export function provideSocial(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HOME_MODE_ENTRIES, multi: true, useValue: { load: () => import('./home-entry/social-home-entry.component').then(m => m.SocialHomeEntryComponent) } },
  ]);
}
