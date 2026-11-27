/** Le bilan de la semaine passée du joueur (du lundi au dimanche) : TypeScript pur, calculé par le serveur sur ses parties terminées. */

export interface WeekReviewDay {
  /** `aaaa-mm-jj`. */
  readonly date: string;
  /** Le score d'une partie terminée ; `null` : pas jouée, abandonnée ou expirée. */
  readonly score: number | null;
}

export interface WeekBestTrack {
  readonly date: string;
  readonly artist: string;
  readonly title: string;
  readonly score: number;
}

export interface WeekReview {
  /** Le lundi de la semaine, `aaaa-mm-jj`. */
  readonly weekStart: string;
  readonly days: readonly WeekReviewDay[];
  readonly maxPossibleScore: number;
  readonly playedCount: number;
  readonly averageScore: number | null;
  readonly bestDay: string | null;
  readonly bestScore: number | null;
  readonly bestTrack: WeekBestTrack | null;
}

/** Le jour de jeu (`aaaa-mm-jj`, UTC) est-il un lundi ? C'est ce jour-là que l'accueil dit « la semaine dernière ». */
export function isMonday(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() === 1;
}

/** La carte de l'accueil : le lundi, pour un compte, s'il a joué au moins un jour la semaine dernière et n'a pas fermé cette semaine-là. */
export function showWeekCard(input: { linked: boolean; today: string; review: WeekReview | null; dismissedWeek: string | null }): boolean {
  const { linked, today, review, dismissedWeek } = input;
  return linked && isMonday(today) && review !== null && review.playedCount > 0 && dismissedWeek !== review.weekStart;
}

/** La hauteur d'une barre, de 0 à 1, par rapport à la borne haute d'un jour (0 : rien joué). */
export function barRatio(score: number | null, maxPossibleScore: number): number {
  if (score === null || maxPossibleScore <= 0) return 0;
  return Math.min(1, Math.max(0, score / maxPossibleScore));
}
