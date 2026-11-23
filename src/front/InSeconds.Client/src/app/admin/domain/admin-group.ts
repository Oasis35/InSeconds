/** Un membre d'un groupe, tel que l'admin le lit en dépliant le groupe. Jamais d'email ni d'identifiant. */
export interface AdminGroupMember {
  /** Le pseudo du compte ; `null` s'il est introuvable. */
  pseudo: string | null;
  isOwner: boolean;
  /** Instant ISO avec fuseau. */
  joinedAt: string;
}

/** Un groupe d'amis tel que l'onglet Groupes de l'admin l'affiche (modération). Jamais le code d'invitation ; les membres se lisent en dépliant le groupe. */
export interface AdminGroup {
  id: number;
  name: string;
  memberCount: number;
  ownerId: string;
  /** Le pseudo du créateur (un compte) ; `null` s'il est introuvable. */
  ownerPseudo: string | null;
  /** Instant ISO avec fuseau. */
  createdAt: string;
}

/** Filtre texte sur le nom du groupe ou le pseudo de son créateur, sans tenir compte de la casse ni des espaces autour. */
export function filterGroups(groups: readonly AdminGroup[], text: string): readonly AdminGroup[] {
  const query = text.trim().toLowerCase();
  if (!query) return groups;
  return groups.filter(g => g.name.toLowerCase().includes(query) || (g.ownerPseudo ?? '').toLowerCase().includes(query));
}
