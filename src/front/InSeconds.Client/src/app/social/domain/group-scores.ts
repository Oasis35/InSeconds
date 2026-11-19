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
  /** Les jours de la semaine où il a fini une partie (0 à 7). */
  readonly daysPlayed: number;
}

/** Le classement du Défi du jour d'un groupe. */
export interface DailyScores {
  /** Le jour de jeu en cours (jour UTC). */
  readonly day: string;
  /** Le joueur a fini son défi du jour : les scores du jour sont montrés ; avant, seulement qui a joué. */
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

/** Combien de membres ont fini leur défi du jour, et sur combien. */
export function playedToday(scores: DailyScores): { readonly played: number; readonly members: number } {
  return { played: scores.today.filter(entry => entry.played).length, members: scores.today.length };
}
