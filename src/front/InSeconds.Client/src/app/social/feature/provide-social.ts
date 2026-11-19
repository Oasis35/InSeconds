import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { HOME_ENTRY_ORDER, HOME_MODE_ENTRIES } from '../../core/shell/home-mode-entries/home-mode-entries';

/**
 * Ce que le domaine `social` branche dans l'app au démarrage : la carte amis de l'accueil, chargée à la demande, au-dessus de la carte Survie
 * (`HOME_ENTRY_ORDER`). Le client de l'API est fourni par la carte elle-même.
 */
export function provideSocial(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: HOME_ENTRY_ORDER.friends, load: () => import('./home-entry/social-home-entry.component').then(m => m.SocialHomeEntryComponent) } },
  ]);
}
