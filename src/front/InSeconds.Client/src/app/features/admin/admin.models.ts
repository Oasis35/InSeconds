export interface RefreshPreviewsResult { checked: number; updated: number; failed: number; }
export interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
export interface PoolTrackDto {
  id: number; artist: string; title: string; deezerTrackId: number;
  hasPreview?: boolean | null;
  lastUsedDate?: string | null;
  usageCount?: number;
  unlockDate?: string | null;
}
export interface PoolTracksResponse { available: PoolTrackDto[]; used: PoolTrackDto[]; }
export interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
export interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; coverHash?: string | null; }

export interface RegisteredPlayerDto {
  id: string; pseudo: string | null; email: string | null;
  createdAt: string; lastSeenAt: string | null; gamesPlayed: number; isAdmin: boolean;
}
export interface RegisteredPlayersResponse { players: RegisteredPlayerDto[]; }

export type AdminTab = 'dashboard' | 'pool' | 'defis' | 'joueurs' | 'actions';
