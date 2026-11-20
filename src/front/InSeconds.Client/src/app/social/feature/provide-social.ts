import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { DAY_FRIENDS_SLOT } from '../../core/shell/day-friends-slot/day-friends-slot';
import { HOME_ENTRY_ORDER, HOME_MODE_ENTRIES } from '../../core/shell/home-mode-entries/home-mode-entries';

/**
 * Ce que le domaine `social` branche dans l'app au démarrage, chargé à la demande : la carte amis de l'accueil, au-dessus de la carte Survie
 * (`HOME_ENTRY_ORDER`), et « Tes amis ce jour-là » de la page d'un jour de l'historique (`DAY_FRIENDS_SLOT`).
 * Le client de l'API est fourni par chaque composant.
 */
export function provideSocial(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: HOME_MODE_ENTRIES, multi: true, useValue: { order: HOME_ENTRY_ORDER.friends, load: () => import('./home-entry/social-home-entry.component').then(m => m.SocialHomeEntryComponent) } },
    { provide: DAY_FRIENDS_SLOT, useValue: { load: () => import('./day-friends/day-friends.component').then(m => m.DayFriendsComponent) } },
  ]);
}
