/** État de l'extrait d'un morceau, tel que le contrôle de Deezer le connaît (`unknown` : jamais contrôlé). */
export type PreviewState = 'unknown' | 'available' | 'missing';

/**
 * Un morceau du pool tel que l'admin le voit. L'usage (dernier jour, nombre d'utilisations, date de
 * déblocage, défi du jour) vient du module Daily : « disponible » ou « utilisé » se déduit de
 * `usageCount`. Les dates sont des jours ISO `yyyy-MM-dd`.
 */
export interface PoolTrack {
  readonly id: number;
  readonly deezerTrackId: number;
  readonly artist: string;
  readonly title: string;
  readonly preview: PreviewState;
  readonly isDisabled: boolean;
  readonly lastUsedDate: string | null;
  readonly usageCount: number;
  readonly unlockDate: string | null;
  /** Dans le défi du jour : peut être renommé (avec un avertissement) mais pas désactivé. */
  readonly inTodayChallenge: boolean;
}

/** Un morceau qui a déjà servi dans un défi ne se supprime plus : on le retire du tirage (désactivation). */
export function isUsed(track: PoolTrack): boolean {
  return track.usageCount > 0;
}

/** « Artiste — Titre », la forme sous laquelle un morceau est nommé dans l'admin. */
export function trackLabel(track: Pick<PoolTrack, 'artist' | 'title'>): string {
  return `${track.artist} — ${track.title}`;
}

/** Un résultat de la recherche Deezer de l'admin : de quoi écouter l'extrait et ajouter le morceau. */
export interface DeezerResult {
  readonly deezerTrackId: number;
  readonly artist: string;
  readonly title: string;
  readonly previewUrl: string | null;
}

/** Longueurs maximales de l'artiste et du titre (celles de l'API). */
export const ARTIST_MAX_LENGTH = 200;
export const TITLE_MAX_LENGTH = 300;

/** Ce que l'admin peut corriger : les deux noms, non vides une fois les espaces retirés. */
export function isValidTrackName(artist: string, title: string): boolean {
  const a = artist.trim();
  const t = title.trim();
  return a.length > 0 && a.length <= ARTIST_MAX_LENGTH && t.length > 0 && t.length <= TITLE_MAX_LENGTH;
}
