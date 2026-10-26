import { InjectionToken, Type } from '@angular/core';

/**
 * L'entrée d'un autre mode de jeu sur l'accueil du jeu du jour (et sur « déjà joué ») : un composant chargé à la demande, qui décide seul s'il
 * s'affiche. Le Daily n'importe aucun mode : chaque mode fournit la sienne (`provideRuns()`), le Daily affiche ce qu'il reçoit.
 */
export interface HomeModeEntry {
  readonly load: () => Promise<Type<unknown>>;
}

/** Jeton multiple : un `{ provide: HOME_MODE_ENTRIES, multi: true, useValue }` par mode ; aucun mode, aucune entrée. */
export const HOME_MODE_ENTRIES = new InjectionToken<readonly HomeModeEntry[]>('HOME_MODE_ENTRIES', { factory: () => [] });
