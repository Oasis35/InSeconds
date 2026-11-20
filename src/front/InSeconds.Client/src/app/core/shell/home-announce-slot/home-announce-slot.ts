import { InjectionToken, Type } from '@angular/core';

/**
 * Une annonce en tête de l'accueil, au-dessus de la carte du défi : un composant chargé à la demande, fourni par un domaine (`provideSocial()` :
 * l'annonce des groupes) qui décide seul s'il s'affiche. Le Daily ne connaît pas ce domaine : sans fournisseur, rien.
 */
export interface HomeAnnounce {
  readonly load: () => Promise<Type<unknown>>;
}

export const HOME_ANNOUNCE = new InjectionToken<HomeAnnounce | null>('HOME_ANNOUNCE', { factory: () => null });
