import { DailyScores, GroupScores, TodayScoreEntry } from './group-scores';

/** Un membre sur la carte amis avant que le joueur ait fini son défi : son nom et s'il a joué, jamais un score. */
export interface FriendPresence {
  readonly pseudo: string;
  readonly isMe: boolean;
  readonly played: boolean;
}

/** Les lignes de la carte amis une fois le défi fait. */
export const FRIENDS_TOP_SIZE = 4;

/**
 * Ce que montre la carte amis de l'accueil : un compte sans groupe (créer un groupe), qui a joué dans son groupe tant
 * que son défi reste à faire (sans scores), ou le haut du classement du jour une fois le défi fait.
 */
export type FriendsCardView =
  | { readonly kind: 'no_group' }
  | { readonly kind: 'pending'; readonly groupId: number; readonly name: string; readonly played: number; readonly total: number; readonly members: readonly FriendPresence[] }
  | { readonly kind: 'revealed'; readonly groupId: number; readonly name: string; readonly top: readonly TodayScoreEntry[] };

/**
 * Les lignes classées du jour sur une carte de `size` lignes : la tête du classement ; si le joueur n'y est pas, il prend la dernière ligne (avec son
 * vrai rang). Vide tant que les scores du jour sont cachés.
 */
export function todayTop(scores: DailyScores, size: number): readonly TodayScoreEntry[] {
  if (!scores.todayRevealed || size <= 0) return [];
  const ranked = scores.today.filter(entry => entry.rank !== null);
  const head = ranked.slice(0, size);
  if (head.some(entry => entry.isMe)) return head;
  const me = ranked.find(entry => entry.isMe);
  return me ? [...head.slice(0, size - 1), me] : head;
}

/** La carte d'un groupe à partir de ses scores ; `null` si le serveur ne rend pas le Défi du jour (rien à montrer). */
export function groupCardView(scores: GroupScores): FriendsCardView | null {
  const daily = scores.daily;
  if (!daily) return null;
  if (daily.todayRevealed) return { kind: 'revealed', groupId: scores.groupId, name: scores.name, top: todayTop(daily, FRIENDS_TOP_SIZE) };
  const played = daily.today.filter(entry => entry.played).length;
  const total = daily.today.length;
  // Ceux qui ont joué d'abord, le joueur en tête des autres : la rangée se lit « qui m'attend ».
  const members = [...daily.today]
    .sort((a, b) => Number(b.played) - Number(a.played) || Number(b.isMe) - Number(a.isMe))
    .map(({ pseudo, isMe, played: done }) => ({ pseudo, isMe, played: done }));
  return { kind: 'pending', groupId: scores.groupId, name: scores.name, played, total, members };
}
