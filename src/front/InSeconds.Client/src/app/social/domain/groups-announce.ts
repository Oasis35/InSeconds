/** Le dernier jour (jour de jeu UTC, `aaaa-mm-jj`) où l'annonce des groupes s'affiche : trois semaines après leur arrivée (20/11/2026). */
export const GROUPS_ANNOUNCE_UNTIL = '2026-12-11';

/** L'annonce est-elle encore de saison à ce jour de jeu (`aaaa-mm-jj`) ? */
export function announceActive(today: string): boolean {
  return today <= GROUPS_ANNOUNCE_UNTIL;
}

/** Ce que dit la carte d'annonce, réservée aux comptes : sans groupe (en créer un), membre (créer un nouveau groupe, tant qu'il est sous le maximum). Un invité n'a pas d'annonce : l'accueil lui propose le compte à part (tuile sous le défi). */
export type AnnounceVariant = 'no_group' | 'member';

export function announceVariant(groupCount: number): AnnounceVariant {
  return groupCount > 0 ? 'member' : 'no_group';
}
