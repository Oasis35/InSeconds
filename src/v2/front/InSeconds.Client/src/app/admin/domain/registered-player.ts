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

/** Filtre texte sur le pseudo ou l'email, sans tenir compte de la casse ni des espaces autour. */
export function filterPlayers(players: readonly RegisteredPlayer[], text: string): readonly RegisteredPlayer[] {
  const query = text.trim().toLowerCase();
  if (!query) return players;
  return players.filter(p =>
    (p.pseudo ?? '').toLowerCase().includes(query) || (p.email ?? '').toLowerCase().includes(query));
}
