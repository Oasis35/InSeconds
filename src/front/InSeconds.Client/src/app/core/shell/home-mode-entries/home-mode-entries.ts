import { InjectionToken, Type } from '@angular/core';

/**
 * L'entrée d'un autre domaine sur l'accueil du jeu du jour (et sur « déjà joué ») : un composant chargé à la demande, qui décide seul s'il
 * s'affiche. Le Daily n'importe ni les modes ni les groupes : chacun fournit la sienne (`provideSocial()` la carte amis, `provideRuns()` la carte
 * Survie), le Daily affiche ce qu'il reçoit, dans l'ordre des fournisseurs de `app.config.ts`.
 */
export interface HomeModeEntry {
  readonly load: () => Promise<Type<unknown>>;
}

/** Jeton multiple : un `{ provide: HOME_MODE_ENTRIES, multi: true, useValue }` par domaine ; aucun, aucune entrée. */
export const HOME_MODE_ENTRIES = new InjectionToken<readonly HomeModeEntry[]>('HOME_MODE_ENTRIES', { factory: () => [] });
