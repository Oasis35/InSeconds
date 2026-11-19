import { InjectionToken, Type } from '@angular/core';

/**
 * L'entrée d'un autre domaine sur l'accueil du jeu du jour (et sur « déjà joué ») : un composant chargé à la demande, qui décide seul s'il
 * s'affiche. Le Daily n'importe ni les modes ni les groupes : chacun fournit la sienne (`provideSocial()` la carte amis, `provideRuns()` la carte
 * Survie), le Daily affiche ce qu'il reçoit, rangé par `order`.
 */
export interface HomeModeEntry {
  /** La place sous la carte du défi, la plus petite d'abord : `HOME_ENTRY_ORDER`. */
  readonly order: number;
  readonly load: () => Promise<Type<unknown>>;
}

/** L'ordre des cartes sous celle du défi : la carte amis, puis la carte Survie. */
export const HOME_ENTRY_ORDER = { friends: 10, survie: 20 } as const;

/** Jeton multiple : un `{ provide: HOME_MODE_ENTRIES, multi: true, useValue }` par domaine ; aucun, aucune entrée. */
export const HOME_MODE_ENTRIES = new InjectionToken<readonly HomeModeEntry[]>('HOME_MODE_ENTRIES', { factory: () => [] });
