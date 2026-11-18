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
  /** Ce que sa dernière partie a changé dans ce groupe : la place d'avant et le membre qu'il vient de dépasser ; `null` si sa place n'a pas monté. */
  readonly moved?: RankMovement | null;
}

/** Une montée au classement d'un groupe : « tu passes devant Léa » (de la 3e place à la 2e). */
export interface RankMovement {
  readonly from: number;
  readonly passed: string;
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

/** La place du joueur dans un classement ; avec `delta` (les points que sa dernière partie a ajoutés à son niveau), sa montée éventuelle. */
export function standingOf(ranking: GroupRanking, delta: number | null = null): GroupStanding {
  const me = ranking.entries.find(entry => entry.isMe);
  const moved = movementOf(ranking, delta);
  return { groupId: ranking.groupId, name: ranking.name, rank: me?.rank ?? null, members: ranking.entries.length, ...(moved ? { moved } : {}) };
}

/**
 * Sa montée dans un classement, retrouvée des points : avant sa partie il avait `points - delta` ; ceux qu'il a dépassés sont les membres dont les points
 * sont entre les deux, le plus proche d'abord. `null` sans montée, sans partie ou sans changement de niveau (son premier niveau n'a pas d'avant).
 */
export function movementOf(ranking: GroupRanking, delta: number | null): RankMovement | null {
  const me = ranking.entries.find(entry => entry.isMe);
  if (me?.points == null || me.rank === null || delta === null || delta <= 0) return null;
  const before = me.points - delta;
  const passed = ranking.entries
    .filter(entry => !entry.isMe && entry.points !== null && entry.points > before && entry.points < me.points!)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  if (!passed) return null;
  const ahead = ranking.entries.filter(entry => !entry.isMe && entry.points !== null && entry.points > before).length;
  return { from: ahead + 1, passed: passed.pseudo };
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

/** La teinte (de 1 à 4) de la pastille d'un pseudo : toujours la même pour le même pseudo, sans autre sens que de les distinguer. */
export function avatarOf(pseudo: string): 1 | 2 | 3 | 4 {
  let sum = 0;
  for (const char of pseudo.trim().toLowerCase()) sum += char.codePointAt(0) ?? 0;
  return ((sum % 4) + 1) as 1 | 2 | 3 | 4;
}

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

/** Sa meilleure place parmi ses groupes (le plus petit rang) ; `null` sans groupe ou tant qu'il n'a fini aucune partie. En cas d'égalité, le premier groupe. */
export function bestStanding(standings: readonly GroupStanding[]): (GroupStanding & { readonly rank: number }) | null {
  let best: (GroupStanding & { readonly rank: number }) | null = null;
  for (const standing of standings) {
    if (standing.rank !== null && (best === null || standing.rank < best.rank)) best = { ...standing, rank: standing.rank };
  }
  return best;
}

/** Sa place au classement général ; `null` s'il n'y apparaît pas (c'est son choix, éteint par défaut) ou n'a fini aucune partie. */
export function generalRankOf(ranking: GeneralRanking): number | null {
  if (!ranking.visible) return null;
  return [...ranking.top, ...ranking.around].find(entry => entry.isMe)?.rank ?? null;
}
