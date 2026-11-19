/** Un membre au classement du jour d'un groupe. `rank` et `score` sont vides s'il n'a pas fini sa partie, ou tant que le joueur n'a pas fini la sienne. */
export interface TodayScoreEntry {
  readonly rank: number | null;
  readonly pseudo: string;
  readonly isMe: boolean;
  /** Il a fini sa partie du jour : se montre même avant que le joueur ait fini la sienne, sans le score. */
  readonly played: boolean;
  readonly score: number | null;
}

/** Un membre au classement de la semaine glissante : la somme de ses scores, et les jours où il a fini une partie (0 à 7). */
export interface WeekScoreEntry {
  readonly rank: number | null;
  readonly pseudo: string;
  readonly isMe: boolean;
  readonly points: number | null;
  readonly daysPlayed: number;
}

/** Le classement d'un groupe pour un mode (le Défi du jour) : le jour et la semaine. */
export interface ModeScores {
  /** Le jour de jeu en cours (`aaaa-mm-jj`, jour UTC). */
  readonly day: string;
  /** Le joueur a fini sa partie du jour : les scores du jour sont montrés ; avant, seulement qui a joué. */
  readonly todayRevealed: boolean;
  readonly weekDays: number;
  readonly today: readonly TodayScoreEntry[];
  readonly week: readonly WeekScoreEntry[];
}

/** Les scores d'un groupe ; `daily` vide si le serveur n'en rend pas pour le Défi du jour. */
export interface GroupScores {
  readonly groupId: number;
  readonly name: string;
  readonly daily: ModeScores | null;
}

/** Le nom du Défi du jour parmi les modes que rend le serveur. */
export const DAILY_MODE = 'daily';

/** Combien de membres ont fini leur partie du jour, sur combien. */
export function playedToday(scores: ModeScores): { readonly played: number; readonly total: number } {
  return { played: scores.today.filter(entry => entry.played).length, total: scores.today.length };
}

/**
 * Les lignes classées du jour à montrer sur une carte de `size` lignes : la tête du classement ; si le joueur n'y est pas, il prend la dernière place
 * de la carte (avec son vrai rang). Vide tant que les scores du jour sont cachés.
 */
export function todayTop(scores: ModeScores, size: number): readonly TodayScoreEntry[] {
  if (!scores.todayRevealed || size <= 0) return [];
  const ranked = scores.today.filter(entry => entry.rank !== null);
  const head = ranked.slice(0, size);
  if (head.some(entry => entry.isMe)) return head;
  const me = ranked.find(entry => entry.isMe);
  return me ? [...head.slice(0, size - 1), me] : head;
}

/** Un membre sur la carte amis avant que le joueur ait fini son défi : son nom et s'il a joué, jamais un score. */
export interface FriendPresence {
  readonly pseudo: string;
  readonly isMe: boolean;
  readonly played: boolean;
}

/** Les lignes de la carte amis de l'accueil une fois le défi fait. */
export const FRIENDS_TOP_SIZE = 4;

/**
 * Ce que montre la carte amis de l'accueil : un invité (créer un compte), un compte sans groupe (créer un groupe), qui a joué dans son groupe tant
 * que son défi reste à faire (sans scores), ou le haut du classement du jour une fois le défi fait.
 */
export type FriendsCardView =
  | { readonly kind: 'guest' }
  | { readonly kind: 'no_group' }
  | { readonly kind: 'pending'; readonly groupId: number; readonly name: string; readonly played: number; readonly total: number; readonly members: readonly FriendPresence[] }
  | { readonly kind: 'revealed'; readonly groupId: number; readonly name: string; readonly top: readonly TodayScoreEntry[] };

/** Le groupe de la carte : le dernier regardé au classement s'il en est encore membre, sinon le premier ; `null` sans groupe. */
export function cardGroupId(groupIds: readonly number[], lastGroupId: number | null): number | null {
  if (lastGroupId !== null && groupIds.includes(lastGroupId)) return lastGroupId;
  return groupIds[0] ?? null;
}

/** La carte d'un groupe à partir de ses scores ; `null` si le serveur ne rend pas le Défi du jour (rien à montrer). */
export function groupCardView(scores: GroupScores): FriendsCardView | null {
  const daily = scores.daily;
  if (!daily) return null;
  if (daily.todayRevealed) return { kind: 'revealed', groupId: scores.groupId, name: scores.name, top: todayTop(daily, FRIENDS_TOP_SIZE) };
  const { played, total } = playedToday(daily);
  // Ceux qui ont joué d'abord, le joueur en tête des autres : la rangée se lit « qui m'attend ».
  const members = [...daily.today]
    .sort((a, b) => Number(b.played) - Number(a.played) || Number(b.isMe) - Number(a.isMe))
    .map(({ pseudo, isMe, played: done }) => ({ pseudo, isMe, played: done }));
  return { kind: 'pending', groupId: scores.groupId, name: scores.name, played, total, members };
}
