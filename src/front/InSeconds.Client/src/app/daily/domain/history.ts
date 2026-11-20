/** L'état d'un jour de défi pour le joueur (lu tel quel du serveur). */
export type HistoryDayState = 'played' | 'unfinished' | 'missed' | 'today';

/** Un jour de défi du mois : son état, le score d'une partie terminée, et la borne haute de la teinte de sa case. */
export interface HistoryDay {
  /** `aaaa-mm-jj`. */
  readonly date: string;
  readonly state: HistoryDayState;
  readonly score: number | null;
  readonly maxPossibleScore: number;
}

/** L'historique du joueur sur le défi du jour : le calendrier d'un mois et ses chiffres. */
export interface DailyHistory {
  /** Le mois lu (`aaaa-mm`). */
  readonly month: string;
  /** Le mois d'avant qui a un défi, le mois d'après s'il n'est pas dans le futur ; `null` : rien de ce côté. */
  readonly previousMonth: string | null;
  readonly nextMonth: string | null;
  /** Les jours de défi du mois jusqu'à aujourd'hui, du plus ancien au plus récent. */
  readonly days: readonly HistoryDay[];
  /** Les parties terminées du mois, sur les jours qu'il pouvait jouer (ceux d'avant aujourd'hui, plus aujourd'hui s'il l'a terminé). */
  readonly monthPlayedCount: number;
  readonly monthPublishedCount: number;
  readonly monthAverageScore: number | null;
  readonly monthBestScore: number | null;
}

/** Un historique vide pour ce mois (un navigateur que le serveur ne connaît pas encore). */
export function emptyHistory(month: string): DailyHistory {
  return { month, previousMonth: null, nextMonth: null, days: [], monthPlayedCount: 0, monthPublishedCount: 0, monthAverageScore: null, monthBestScore: null };
}

/** Une case du calendrier : un jour du mois (sans défi, ou dans le futur : éteint), ou une case vide avant le premier jour. */
export interface CalendarCell {
  readonly date: string;
  readonly day: number;
  /** `none` : pas de défi ce jour-là (ou un jour à venir). */
  readonly state: HistoryDayState | 'none';
  readonly score: number | null;
  /** L'intensité de l'ambre d'une case jouée, de 0,18 à 0,92 ; 0 sinon. */
  readonly tint: number;
}

/** L'intensité de l'ambre d'une case jouée : plus le score est proche du maximum, plus elle est vive. */
export function scoreTint(score: number, maxPossibleScore: number): number {
  if (maxPossibleScore <= 0) return 0.18;
  const ratio = Math.min(1, Math.max(0, (score / maxPossibleScore - 0.2) / 0.6));
  return Math.round((0.18 + ratio * 0.74) * 100) / 100;
}

/**
 * Les semaines du mois (`aaaa-mm`, lundi en premier) : `null` pour les cases hors du mois. Chaque jour prend l'état que le serveur donne ; un jour
 * sans défi ou à venir est éteint.
 */
export function calendarWeeks(month: string, days: readonly HistoryDay[]): readonly (CalendarCell | null)[][] {
  const [year, monthNumber] = month.split('-').map(Number);
  const byDate = new Map(days.map(d => [d.date, d]));
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: (CalendarCell | null)[] = Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null);
  for (let day = 1; day <= count; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const found = byDate.get(date);
    cells.push(found
      ? { date, day, state: found.state, score: found.score, tint: found.state === 'played' && found.score !== null ? scoreTint(found.score, found.maxPossibleScore) : 0 }
      : { date, day, state: 'none', score: null, tint: 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Où mène une case : les réponses du jour, publiées dès le lendemain ; aujourd'hui, le défi du jour (jouer, ou son résultat). */
export function dayLink(cell: CalendarCell): readonly string[] | null {
  if (cell.state === 'none') return null;
  return cell.state === 'today' ? ['/daily'] : ['/history/daily', cell.date];
}
