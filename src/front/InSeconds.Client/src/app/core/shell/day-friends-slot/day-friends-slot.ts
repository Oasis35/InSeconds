import { InjectionToken, Type } from '@angular/core';

/**
 * « Tes amis ce jour-là » sur la page d'un jour de l'historique : un composant chargé à la demande, fourni par le domaine des groupes
 * (`provideSocial()`), qui reçoit le jour par son entrée `date` (`aaaa-mm-jj`). Le Daily ne connaît pas les groupes : sans fournisseur, rien.
 */
export interface DayFriendsSlot {
  readonly load: () => Promise<Type<unknown>>;
}

export const DAY_FRIENDS_SLOT = new InjectionToken<DayFriendsSlot | null>('DAY_FRIENDS_SLOT', { factory: () => null });
