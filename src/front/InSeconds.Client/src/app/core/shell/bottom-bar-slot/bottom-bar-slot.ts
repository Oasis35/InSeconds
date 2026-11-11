import { InjectionToken, Type } from '@angular/core';

/**
 * La barre du bas de la V4 : un composant chargé à la demande, fourni par le domaine qui porte le flag (`provideRuns()`). La coque ne connaît
 * aucun mode : elle affiche ce qu'elle reçoit, et rien sans lui.
 */
export interface BottomBarSlot {
  readonly load: () => Promise<Type<unknown>>;
}

export const BOTTOM_BAR_SLOT = new InjectionToken<BottomBarSlot | null>('BOTTOM_BAR_SLOT', { factory: () => null });
