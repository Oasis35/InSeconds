/** Le dernier jour (jour de jeu UTC, `aaaa-mm-jj`) où l'annonce des groupes s'affiche : trois semaines après leur arrivée (20/11/2026). */
export const GROUPS_ANNOUNCE_UNTIL = '2026-12-11';

/** L'annonce est-elle encore de saison à ce jour de jeu (`aaaa-mm-jj`) ? */
export function announceActive(today: string): boolean {
  return today <= GROUPS_ANNOUNCE_UNTIL;
}

/** Ce que dit la carte d'annonce : un invité (il lui faut un compte), un compte sans groupe (en créer un), un membre (inviter ses amis). */
export type AnnounceVariant = 'guest' | 'no_group' | 'member';

export function announceVariant(linked: boolean, groupCount: number): AnnounceVariant {
  if (!linked) return 'guest';
  return groupCount > 0 ? 'member' : 'no_group';
}
