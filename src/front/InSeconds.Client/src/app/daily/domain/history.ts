/** Le verdict du joueur sur un morceau d'un défi passé : de quoi dessiner une petite barre. */
export interface HistoryTrack {
  readonly position: number;
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
}

/** Un défi que le joueur a terminé : son jour (`aaaa-mm-jj`), son score, ses verdicts. */
export interface HistoryGame {
  readonly date: string;
  readonly score: number;
  readonly tracks: readonly HistoryTrack[];
}

/** L'historique du joueur sur le défi du jour : le résumé de toutes ses parties, puis celles d'un mois. */
export interface DailyHistory {
  /** Le mois lu (`aaaa-mm`). */
  readonly month: string;
  /** Le mois d'avant et le mois d'après qui ont une partie ; `null` : rien de ce côté. */
  readonly previousMonth: string | null;
  readonly nextMonth: string | null;
  readonly playedCount: number;
  readonly averageScore: number | null;
  readonly bestScore: number | null;
  readonly games: readonly HistoryGame[];
}

/** Ce que dit une barre : tout trouvé, rien trouvé, ou l'un des deux (artiste ou titre). */
export type TrackVerdict = 'found' | 'half' | 'missed';

export function verdictOf(track: HistoryTrack): TrackVerdict {
  if (track.artistCorrect && track.titleCorrect) return 'found';
  return track.artistCorrect || track.titleCorrect ? 'half' : 'missed';
}

/**
 * Où mène une ligne : les réponses du jour (`/daily/archive/<date>`), publiées dès le lendemain ; la partie d'aujourd'hui renvoie au résultat
 * du jour, ses réponses n'étant pas encore publiées.
 */
export function gameLink(date: string, today: string): readonly string[] {
  return date === today ? ['/daily'] : ['/daily/archive', date];
}
