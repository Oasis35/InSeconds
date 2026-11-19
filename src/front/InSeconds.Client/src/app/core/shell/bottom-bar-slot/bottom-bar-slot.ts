import { InjectionToken, Type } from '@angular/core';

/**
 * La barre du bas : un composant chargé à la demande, celui de la coque par défaut (les tests en fournissent un autre). Elle est pour tous les joueurs.
 */
export interface BottomBarSlot {
  readonly load: () => Promise<Type<unknown>>;
}

export const BOTTOM_BAR_SLOT = new InjectionToken<BottomBarSlot | null>('BOTTOM_BAR_SLOT', {
  factory: () => ({ load: () => import('../bottom-bar/bottom-bar.component').then(m => m.BottomBarComponent) }),
});
