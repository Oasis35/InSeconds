export interface ResetResult { deleted: number; date: string; }
export interface TrackDto { position: number; artist: string; title: string; deezerTrackId: number; }
export interface PoolTrackDto { id: number; artist: string; title: string; deezerTrackId: number; hasPreview?: boolean | null; }
export interface PoolTracksResponse { available: PoolTrackDto[]; used: PoolTrackDto[]; }
export interface ChallengeDto { id: number; date: string; tracks: TrackDto[]; }
export interface DeezerTrackInfo { artist: string; title: string; previewUrl: string | null; deezerTrackId: number; coverHash?: string | null; }

export type AdminTab = 'dashboard' | 'pool' | 'defis' | 'actions';
