/** Un groupe entre amis dont le joueur est membre. */
export interface Group {
  readonly id: number;
  readonly name: string;
  /** Le code du lien d'invitation (8 caractères). */
  readonly inviteCode: string;
  readonly memberCount: number;
  readonly maxMembers: number;
  readonly isOwner: boolean;
}

/** Les groupes du joueur et le nombre qu'il peut avoir. */
export interface MyGroups {
  readonly groups: readonly Group[];
  readonly maxGroups: number;
}

/** Une ligne du classement d'un groupe. `rank`, `points` et `badge` sont vides pour un membre qui n'a encore fini aucune partie. */
export interface RankingEntry {
  readonly rank: number | null;
  readonly pseudo: string;
  readonly isMe: boolean;
  readonly points: number | null;
  /** Le badge du membre (une clé de traduction, `runs.discs.gold`), donné par le mode où il a le plus de points. */
  readonly badge: string | null;
}

export interface GroupRanking {
  readonly groupId: number;
  readonly name: string;
  readonly entries: readonly RankingEntry[];
}

/** Ce qu'un lien d'invitation montre avant de rejoindre : jamais un pseudo. */
export interface Invitation {
  readonly groupName: string;
  readonly memberCount: number;
  readonly maxMembers: number;
  readonly isFull: boolean;
  readonly alreadyMember: boolean;
}

/** La place du joueur dans un de ses groupes ; `rank` vide tant qu'il n'a pas fini de partie. */
export interface GroupStanding {
  readonly groupId: number;
  readonly name: string;
  readonly rank: number | null;
  readonly members: number;
}

/** Le nom d'un groupe : mêmes caractères qu'un pseudo ; la longueur maximale est un réglage du serveur, qui tranche. */
export const GROUP_NAME_MIN = 3;
export const GROUP_NAME_MAX = 40;
const GROUP_NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

export function isGroupNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= GROUP_NAME_MIN && trimmed.length <= GROUP_NAME_MAX && GROUP_NAME_PATTERN.test(trimmed);
}

/** Un code d'invitation tel qu'il s'écrit dans un lien : 8 lettres ou chiffres. */
export function isInviteCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{8}$/.test(value);
}

/** Le lien qui fait rejoindre un groupe. */
export const groupInviteUrl = (appUrl: string, inviteCode: string): string => `${appUrl}/ranking/join/${inviteCode}?utm_source=share`;

/** La place du joueur dans un classement. */
export function standingOf(ranking: GroupRanking): GroupStanding {
  const me = ranking.entries.find(entry => entry.isMe);
  return { groupId: ranking.groupId, name: ranking.name, rank: me?.rank ?? null, members: ranking.entries.length };
}

/**
 * La couleur d'un badge : le jeton `--disc-…` du dernier segment de sa clé (`runs.discs.gold` donne `var(--disc-gold)`), le double platine
 * prenant celle du platine. Vide sans badge ou pour une clé mal formée.
 */
export function badgeColor(badge: string | null): string | null {
  const name = badge?.split('.').pop() ?? '';
  if (!/^[a-z_]+$/.test(name)) return null;
  return `var(--disc-${name === 'double_platinum' ? 'platinum' : name.replaceAll('_', '-')})`;
}

/** L'initiale affichée dans la pastille d'un membre. */
export const initialOf = (pseudo: string): string => (pseudo.trim()[0] ?? '?').toUpperCase();

/**
 * Le classement général tel que le joueur le lit : la tête, puis lui et ses voisins s'il y apparaît plus bas. `topPercent` le situe par dizaines
 * (« top 30 % »), vide tant qu'il n'a fini aucune partie ; `canAppear` est faux pour un invité.
 */
export interface GeneralRanking {
  readonly top: readonly RankingEntry[];
  readonly around: readonly RankingEntry[];
  readonly total: number;
  readonly visible: boolean;
  readonly canAppear: boolean;
  readonly topPercent: number | null;
}
