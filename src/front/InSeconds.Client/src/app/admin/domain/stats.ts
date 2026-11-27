// Les jours sont des textes `aaaa-mm-jj` (jour UTC), comme dans `dashboard.ts`.

/** Une ligne de l'onglet Stats : un groupe de joueurs (une source d'arrivée, une classe d'appareil, ou tous) et ses retours. */
export interface CohortRow {
  /** La source (`instagram`, un domaine…), la classe d'appareil (`phone`, `tablet`, `desktop`), `unknown`, ou `all`. */
  key: string;
  /** Les joueurs arrivés sur la période. */
  newPlayers: number;
  day1Eligible: number;
  day1Returned: number;
  day7Eligible: number;
  day7Returned: number;
}

/** L'activité d'un jour : les parties par issue, les joueurs et, parmi eux, ceux dont c'est la toute première partie. */
export interface StatsDay {
  day: string;
  completed: number;
  abandoned: number;
  expired: number;
  players: number;
  firstTimePlayers: number;
}

export interface ListenedBucket {
  seconds: number;
  count: number;
}

export interface StatsAnswers {
  total: number;
  artistFound: number;
  titleFound: number;
  withHint: number;
  byListened: readonly ListenedBucket[];
}

export interface Stats {
  days: number;
  daily: readonly StatsDay[];
  medianScore: number | null;
  overall: CohortRow;
  sources: readonly CohortRow[];
  devices: readonly CohortRow[];
  answers: StatsAnswers;
}

/** Les périodes proposées, comme côté serveur. */
export const STATS_PERIODS: readonly number[] = [7, 30, 90];
export const DEFAULT_STATS_PERIOD = 30;

/** Part en pourcentage entier ; `null` quand personne n'est encore éligible (pas de 0 % trompeur). */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Les joueurs revenus au jour J+1, en pourcentage de ceux qui ont eu le temps de revenir. */
export function day1Rate(row: CohortRow): number | null {
  return percentOf(row.day1Returned, row.day1Eligible);
}

export function day7Rate(row: CohortRow): number | null {
  return percentOf(row.day7Returned, row.day7Eligible);
}

export function totalParts(day: StatsDay): number {
  return day.completed + day.abandoned + day.expired;
}

/** Le plus grand total de parties d'un jour, pour la hauteur des barres (au moins 1). */
export function maxParts(days: readonly StatsDay[]): number {
  return days.reduce((max, d) => Math.max(max, totalParts(d)), 1);
}

export function maxPlayers(days: readonly StatsDay[]): number {
  return days.reduce((max, d) => Math.max(max, d.players), 1);
}
