import { GuessBucket } from './daily';

/** Ce que la phrase du moment fort lit d'un morceau joué : la réponse du joueur et l'histogramme des autres. */
export interface HighlightTrack {
  readonly position: number;
  readonly artist: string;
  /** Le joueur a trouvé l'artiste ou le titre. */
  readonly found: boolean;
  readonly listenedSeconds: number;
  /** Joueurs qui ont trouvé, par palier (le joueur compris). */
  readonly distribution: readonly GuessBucket[];
  readonly notFoundCount: number;
}

/**
 * La phrase sous le score du résultat du jour :
 * - `fast` : « Daft Punk en 1 s : seuls 12 % ont fait aussi vite. » ;
 * - `rare` : « Tu as trouvé Indochine, raté par 71 % des joueurs. »
 */
export type Highlight =
  | { readonly kind: 'fast'; readonly artist: string; readonly seconds: number; readonly percent: number }
  | { readonly kind: 'rare'; readonly artist: string; readonly percent: number };

/** Même seuil que « Tu fais mieux que X % » et les réponses des jours passés : rien sous 5 joueurs. */
export const HIGHLIGHT_MIN_PLAYERS = 5;
/** Au-delà, « seuls 40 % ont fait aussi vite » ne flatte plus personne. */
export const FAST_MAX_PERCENT = 25;
/** Un morceau raté par au moins la moitié des joueurs mérite d'être cité. */
export const RARE_MIN_PERCENT = 50;

const playersOf = (t: HighlightTrack) => t.distribution.reduce((sum, b) => sum + b.count, 0) + t.notFoundCount;

/**
 * Le moment fort de la partie, parmi les morceaux trouvés qui ont au moins `HIGHLIGHT_MIN_PLAYERS` joueurs :
 * 1. le morceau où la part des joueurs qui ont trouvé à ce palier ou plus vite (le joueur compris) est la plus petite, si elle est de
 *    `FAST_MAX_PERCENT` % au plus (égalité : le palier le plus court, puis le premier morceau) ;
 * 2. sinon le morceau trouvé le plus raté par les autres, s'il l'a été par `RARE_MIN_PERCENT` % des joueurs au moins ;
 * 3. sinon rien : mieux vaut pas de phrase qu'une phrase banale.
 */
export function highlightOf(tracks: readonly HighlightTrack[]): Highlight | null {
  const found = tracks.filter(t => t.found && playersOf(t) >= HIGHLIGHT_MIN_PLAYERS);
  if (found.length === 0) return null;

  const fastest = found
    .map(t => {
      const asFast = t.distribution.filter(b => b.durationSeconds <= t.listenedSeconds).reduce((sum, b) => sum + b.count, 0);
      return { track: t, percent: Math.round((asFast / playersOf(t)) * 100) };
    })
    .sort((a, b) => a.percent - b.percent || a.track.listenedSeconds - b.track.listenedSeconds || a.track.position - b.track.position)[0];
  if (fastest.percent <= FAST_MAX_PERCENT) {
    return { kind: 'fast', artist: fastest.track.artist, seconds: fastest.track.listenedSeconds, percent: Math.max(1, fastest.percent) };
  }

  const rarest = found
    .map(t => ({ track: t, percent: Math.round((t.notFoundCount / playersOf(t)) * 100) }))
    .sort((a, b) => b.percent - a.percent || a.track.position - b.track.position)[0];
  return rarest.percent >= RARE_MIN_PERCENT ? { kind: 'rare', artist: rarest.track.artist, percent: rarest.percent } : null;
}
