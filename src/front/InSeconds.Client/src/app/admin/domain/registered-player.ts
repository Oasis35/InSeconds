/** État d'une partie dans l'historique d'un joueur. */
export type PlayerGameStatus = 'Completed' | 'Pending' | 'Abandoned' | 'Expired';

/** Un compte inscrit, tel que l'onglet Joueurs l'affiche. Les instants sont des textes ISO avec fuseau. */
export interface RegisteredPlayer {
  id: string;
  pseudo: string | null;
  email: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  gamesPlayed: number;
  isAdmin: boolean;
  /** Série effective (0 si cassée). */
  currentStreak: number;
  streakFreezes: number;
  streakProtected: boolean;
}

/** Une partie de l'historique (30 derniers jours) ; `date` est le jour du défi (`aaaa-mm-jj`). */
export interface PlayerGame {
  date: string;
  status: PlayerGameStatus;
  /** Seulement pour une partie terminée. */
  score: number | null;
  freezesUsed: number;
  freezeEarned: boolean;
}

const STATUSES: readonly PlayerGameStatus[] = ['Completed', 'Pending', 'Abandoned', 'Expired'];

/** Un statut inconnu de l'API est montré comme une partie inachevée. */
export function toGameStatus(value: string): PlayerGameStatus {
  return (STATUSES as readonly string[]).includes(value) ? (value as PlayerGameStatus) : 'Expired';
}

/**
 * L'email tel que l'onglet Joueurs le montre avant un clic (minimisation, RGPD) : la première lettre,
 * puis le domaine (`c•••@gmail.com`). Sans `@` exploitable : tout masqué.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

/** Filtre texte sur le pseudo ou l'email, sans tenir compte de la casse ni des espaces autour. */
export function filterPlayers(players: readonly RegisteredPlayer[], text: string): readonly RegisteredPlayer[] {
  const query = text.trim().toLowerCase();
  if (!query) return players;
  return players.filter(p =>
    (p.pseudo ?? '').toLowerCase().includes(query) || (p.email ?? '').toLowerCase().includes(query));
}

/**
 * Le compte peut lancer un run : un admin d'office (aucune ligne d'accès), sinon seulement si l'admin l'a autorisé
 * (`authorizedIds`, la liste de `GET /api/admin/runs/access`).
 */
export function canPlayRuns(player: Pick<RegisteredPlayer, 'id' | 'isAdmin'>, authorizedIds: readonly string[]): boolean {
  return player.isAdmin || authorizedIds.includes(player.id);
}

/** Une lecture de l'onglet Joueurs : les comptes, et la part des joueurs d'un jour revenus le lendemain (`null` sans joueur sur la période). */
export interface RegisteredPlayersPage {
  readonly players: readonly RegisteredPlayer[];
  /** En pourcentage, cumulé sur 30 jours, invités compris. */
  readonly nextDayReturnRate: number | null;
}

/** Les comptes qui ont une série en cours, par longueur : 1 jour, 2 à 6 jours, 7 jours et plus. */
export interface StreakBuckets {
  readonly oneDay: number;
  readonly short: number;
  readonly long: number;
  readonly total: number;
}

export function streakBuckets(players: readonly Pick<RegisteredPlayer, 'currentStreak'>[]): StreakBuckets {
  const oneDay = players.filter(p => p.currentStreak === 1).length;
  const short = players.filter(p => p.currentStreak >= 2 && p.currentStreak <= 6).length;
  const long = players.filter(p => p.currentStreak >= 7).length;
  return { oneDay, short, long, total: oneDay + short + long };
}
