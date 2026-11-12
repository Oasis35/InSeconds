/** Un groupe d'amis tel que l'onglet Groupes de l'admin l'affiche (modération). Jamais le code d'invitation ni la liste des membres. */
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
