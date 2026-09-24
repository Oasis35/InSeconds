export interface RefreshPreviewsResult { checked: number; updated: number; failed: number; }
export interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
export interface PoolTrackDto {
  id: number; artist: string; title: string; deezerTrackId: number;
  hasPreview?: boolean | null;
  lastUsedDate?: string | null;
  usageCount?: number;
  unlockDate?: string | null;
  /** Morceau du défi du jour : non renommable avant demain. */
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
