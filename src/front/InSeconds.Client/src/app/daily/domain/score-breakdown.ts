import { DailySettings } from './daily';

/**
 * D'où viennent les points d'un morceau, dans l'ordre du serveur (`DurationScoringPolicy`) : le barème du palier écouté, divisé par deux si un
 * seul des deux (artiste, titre) est trouvé, puis diminué du pourcentage du niveau d'indice pris.
 */
export interface ScoreBreakdown {
  /** Le palier écouté, en secondes. */
  readonly seconds: number;
  /** Ce que vaut le morceau trouvé en entier à ce palier. */
  readonly base: number;
  /** Ce qui manque quand un seul des deux est trouvé ; `null` quand les deux le sont. */
  readonly missed: 'artist' | 'title' | null;
  /** Le pourcentage retiré pour l'indice pris, 0 sans indice. */
  readonly hintPenaltyPercent: number;
  /** Les points du morceau, ceux du serveur. */
  readonly score: number;
}

/** Le détail des points d'un morceau répondu ; `null` quand rien n'est trouvé (0 point, rien à expliquer) ou que le palier n'a pas de barème. */
export function scoreBreakdown(
  settings: Pick<DailySettings, 'durationScores' | 'hints'>,
  answered: { readonly artistCorrect: boolean; readonly titleCorrect: boolean; readonly listenedSeconds: number; readonly hintLevel: number; readonly score: number },
): ScoreBreakdown | null {
  if (!answered.artistCorrect && !answered.titleCorrect) return null;
  // Le dernier barème du palier s'il est en double, comme le serveur.
  const base = settings.durationScores.reduce((score, d) => (d.seconds === answered.listenedSeconds ? d.score : score), 0);
  if (base <= 0) return null;
  let missed: ScoreBreakdown['missed'] = null;
  if (!answered.titleCorrect) missed = 'title';
  else if (!answered.artistCorrect) missed = 'artist';
  const hintPenaltyPercent = answered.hintLevel > 0 ? (settings.hints.find(h => h.level === answered.hintLevel)?.penaltyPercent ?? 0) : 0;
  return { seconds: answered.listenedSeconds, base, missed, hintPenaltyPercent, score: answered.score };
}
