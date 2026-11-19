/**
 * Le classement d'un groupe au Défi du jour, tel que le serveur le rend au joueur qui regarde : le jour (score de la partie finie, montré seulement
 * à qui a fini son défi) et la semaine glissante (somme des sept derniers jours, un jour manqué vaut 0). Les dates sont des jours `aaaa-mm-jj`.
 */

/** Un membre au classement du jour : `rank` et `score` vides s'il n'a pas fini sa partie, ou tant que le joueur n'a pas fini la sienne. */
export interface TodayScoreEntry {
  readonly rank: number | null;
  readonly pseudo: string;
  readonly isMe: boolean;
  /** Il a fini sa partie du jour : qui a joué n'est pas un secret, son score si. */
  readonly played: boolean;
  readonly score: number | null;
}

/** Un membre au classement de la semaine : `rank` et `points` vides s'il n'a fini aucune partie sur la semaine. */
export interface WeekScoreEntry {
  readonly rank: number | null;
  readonly pseudo: string;
  readonly isMe: boolean;
  readonly points: number | null;
  /** Les jours de la semaine où il a fini une partie, du plus ancien au plus récent. */
  readonly playedDays: readonly string[];
}

/** Le classement du Défi du jour d'un groupe. */
export interface DailyScores {
  /** Le jour de jeu en cours (jour UTC). */
  readonly day: string;
  /** Le joueur a fini son défi du jour : « Aujourd'hui » est ouvert. */
  readonly todayRevealed: boolean;
  /** La longueur de la semaine glissante (7). */
  readonly weekDays: number;
  readonly today: readonly TodayScoreEntry[];
  readonly week: readonly WeekScoreEntry[];
}

/** Les scores d'un groupe ; `daily` vide si le serveur n'en rend pas (aucun mode ne donne de score). */
export interface GroupScores {
  readonly groupId: number;
  readonly name: string;
  readonly daily: DailyScores | null;
}

/** Une ligne d'un classement par score, prête à afficher : la valeur (points ou score) et, pour la semaine, ses jours joués. */
export interface ScoreRow {
  readonly rank: number | null;
  readonly pseudo: string;
  readonly isMe: boolean;
  /** Points de la semaine ou score du jour ; vide : « pas encore joué ». */
  readonly value: number | null;
  /** Un point par jour de la semaine, du plus ancien au jour en cours : `true` s'il l'a joué. Vide pour le jour. */
  readonly days: readonly boolean[] | null;
}

/** Les vues du classement d'un groupe : la semaine (par défaut), le jour, et la Survie pour qui en a l'accès. */
export type GroupView = 'week' | 'today' | 'survie';

/** La vue demandée par l'adresse (`?period=`) ; inconnue, ou Survie sans l'accès : la semaine. */
export function groupViewOf(period: string | null, survie: boolean): GroupView {
  if (period === 'today') return 'today';
  if (period === 'survie' && survie) return 'survie';
  return 'week';
}

/** Le jour `aaaa-mm-jj` décalé de `days` jours (calcul en UTC, sans heure d'été). */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** Les jours de la semaine qui finit `day`, du plus ancien au plus récent. */
export function weekOf(day: string, weekDays: number): string[] {
  return Array.from({ length: weekDays }, (_, index) => addDays(day, index - weekDays + 1));
}

/** Les points de la semaine d'un membre : un par jour, allumé s'il l'a joué. */
export function weekDots(day: string, weekDays: number, playedDays: readonly string[]): boolean[] {
  const played = new Set(playedDays);
  return weekOf(day, weekDays).map(date => played.has(date));
}

/** Les lignes de la semaine. */
export function weekRows(scores: DailyScores): ScoreRow[] {
  return scores.week.map(entry => ({
    rank: entry.rank, pseudo: entry.pseudo, isMe: entry.isMe, value: entry.points,
    days: weekDots(scores.day, scores.weekDays, entry.playedDays),
  }));
}

/** Les lignes du jour (à n'afficher que si `todayRevealed`). */
export function todayRows(scores: DailyScores): ScoreRow[] {
  return scores.today.map(entry => ({ rank: entry.rank, pseudo: entry.pseudo, isMe: entry.isMe, value: entry.score, days: null }));
}

/** Combien de membres ont fini leur défi du jour, et sur combien. */
export function playedToday(scores: DailyScores): { readonly played: number; readonly members: number } {
  return { played: scores.today.filter(entry => entry.played).length, members: scores.today.length };
}
