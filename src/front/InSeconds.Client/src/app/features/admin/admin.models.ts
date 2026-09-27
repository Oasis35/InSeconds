export interface RefreshPreviewsResult { checked: number; updated: number; failed: number; }
export interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
export interface PoolTrackDto {
  id: number; artist: string; title: string; deezerTrackId: number;
  hasPreview?: boolean | null;
  lastUsedDate?: string | null;
  usageCount?: number;
  unlockDate?: string | null;
  /** Morceau dans une partie encore en cours (défi du jour, ou de la veille pas terminé) : non renommable avant demain. */
  renameLocked?: boolean;
  /** Retiré du tirage des prochains défis par l'admin (reste dans le pool, réactivable). */
  isDisabled?: boolean;
  /** Morceau du défi du jour : non désactivable avant demain. */
  inTodayChallenge?: boolean;
}
export interface PoolTracksResponse { available: PoolTrackDto[]; used: PoolTrackDto[]; }
export interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
export interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; coverHash?: string | null; }

export interface RegisteredPlayerDto {
  id: string; pseudo: string | null; email: string | null;
  createdAt: string; lastSeenAt: string | null; gamesPlayed: number; isAdmin: boolean;
  /** Série effective (0 si cassée). */
  currentStreak: number; streakFreezes: number;
  /** Jours manqués couverts par les gels (série « au chaud »). */
  streakProtected: boolean;
}
export interface RegisteredPlayersResponse { players: RegisteredPlayerDto[]; }

export type PlayerGameStatus = 'Completed' | 'Pending' | 'Abandoned' | 'Expired';
export interface PlayerHistoryEntryDto {
  date: string; status: PlayerGameStatus; score: number | null; freezesUsed: number; freezeEarned: boolean;
}
export interface PlayerHistoryResponse { games: PlayerHistoryEntryDto[]; }

export type AdminTab = 'dashboard' | 'pool' | 'defis' | 'joueurs' | 'actions';

/** GET /api/admin/weekly-recap — stories Instagram hebdo (onglet Actions). */
export type WeeklyRecapStatus = 'ok' | 'insufficient_data';
export interface WeeklyTrackDto {
  artist: string; title: string; coverUrl: string | null;
  /** % de réponses avec artiste ET titre justes. */
  successRatePercent: number; answers: number;
}
export interface WeeklyRecapResponse {
  status: WeeklyRecapStatus; from: string; to: string; minAnswers: number;
  mostFound: WeeklyTrackDto | null;
  /** null si un seul morceau est éligible. */
  mostMissed: WeeklyTrackDto | null;
}
