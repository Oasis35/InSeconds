/** État de l'extrait d'un morceau, tel que le contrôle de Deezer le connaît (`unknown` : jamais contrôlé). */
export type PreviewState = 'unknown' | 'available' | 'missing';

/** Ce qu'un mode de jeu dit d'un morceau : présent dans `usages` = le mode l'a joué. Les dates sont des jours ISO `yyyy-MM-dd`. */
export interface ModeUsage {
  readonly mode: string;
  readonly usageCount: number;
  readonly lastUsedDate: string | null;
  readonly unlockDate: string | null;
  readonly inTodayChallenge: boolean;
}

/**
 * Un morceau du pool tel que l'admin le voit. Le pool est commun à tous les modes : `isUsed` vient du back (un mode
 * au moins l'a joué), et `usages` donne ce que chaque mode en a fait (le Daily : dernier jour, apparitions, déblocage,
 * défi du jour).
 */
export interface PoolTrack {
  readonly id: number;
  readonly deezerTrackId: number;
  readonly artist: string;
  readonly title: string;
  readonly preview: PreviewState;
  readonly isDisabled: boolean;
  readonly isUsed: boolean;
  readonly usages: readonly ModeUsage[];
  /** Les genres de l'album du morceau (noms, par ordre alphabétique) : vides tant qu'ils ne sont pas lus chez Deezer. */
  readonly genres: readonly string[];
  /** Dans le défi du jour d'un mode : peut être renommé (avec un avertissement) mais pas désactivé. */
  readonly inTodayChallenge: boolean;
}

/** Un morceau que l'un des modes a joué ne se supprime plus : on le retire du tirage (désactivation). */
export function isUsed(track: Pick<PoolTrack, 'isUsed'>): boolean {
  return track.isUsed;
}

/** Ce que ce mode dit du morceau, `null` s'il ne l'a pas joué. */
export function usageOf(track: Pick<PoolTrack, 'usages'>, mode: string): ModeUsage | null {
  return track.usages.find(usage => usage.mode === mode) ?? null;
}

/** Ce mode a joué le morceau. */
export function isUsedByMode(track: Pick<PoolTrack, 'usages'>, mode: string): boolean {
  return usageOf(track, mode) !== null;
}

/** « Artiste - Titre », la forme sous laquelle un morceau est nommé dans l'admin. */
export function trackLabel(track: Pick<PoolTrack, 'artist' | 'title'>): string {
  return `${track.artist} - ${track.title}`;
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
