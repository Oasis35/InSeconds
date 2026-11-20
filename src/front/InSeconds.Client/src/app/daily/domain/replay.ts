/** « À réécouter » : les morceaux que le joueur a ratés, par jour. TypeScript pur. */

export type ReplayFilter = 'all' | 'none' | 'half';

/** Un morceau raté : ce qu'il a trouvé (jamais ce qu'il a tapé). L'extrait se demande par la date et la position (piège 14). */
export interface ReplayTrack {
  readonly position: number;
  readonly artist: string;
  readonly title: string;
  readonly deezerTrackId: number;
  readonly coverUrl: string | null;
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
}

export interface ReplayDay {
  /** `aaaa-mm-jj`. */
  readonly date: string;
  readonly tracks: readonly ReplayTrack[];
}

/** Une page : ses jours, le jour à passer pour la suivante (`null` : plus rien), et les compteurs des filtres. */
export interface ReplayPage {
  readonly days: readonly ReplayDay[];
  readonly nextBefore: string | null;
  readonly allCount: number;
  readonly noneCount: number;
  readonly halfCount: number;
}

/** Ce qu'il a raté sur un morceau : rien trouvé, le titre, ou l'artiste. */
export type MissKind = 'nothing' | 'title' | 'artist';

export function missOf(track: Pick<ReplayTrack, 'artistCorrect' | 'titleCorrect'>): MissKind {
  if (!track.artistCorrect && !track.titleCorrect) return 'nothing';
  return track.artistCorrect ? 'title' : 'artist';
}

/** La clé d'un morceau d'un jour : un seul extrait se joue à la fois. */
export function replayKey(date: string, position: number): string {
  return `${date}#${position}`;
}

/** Ajoute une page à la suite des jours déjà lus (un jour déjà présent n'est pas répété). */
export function appendDays(current: readonly ReplayDay[], next: readonly ReplayDay[]): readonly ReplayDay[] {
  const known = new Set(current.map(d => d.date));
  return [...current, ...next.filter(d => !known.has(d.date))];
}
