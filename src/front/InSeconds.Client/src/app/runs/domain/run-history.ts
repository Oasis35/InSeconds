import { RunDifficulty, RunDisc, RunTrack } from './run';

/** Une setlist que le joueur a finie (gagnée ou perdue) : une ligne de l'historique. */
export interface RunHistoryEntry {
  /** Sa partie : le détail des morceaux se lit avec elle. */
  readonly sessionId: number;
  /** Le jour (`aaaa-mm-jj`, UTC) où elle s'est terminée. */
  readonly date: string;
  readonly disc: RunDisc;
  readonly score: number;
  /** La plus haute difficulté choisie sur ses manches. */
  readonly difficulty: RunDifficulty;
}

/** L'historique du joueur sur le mode : le résumé de toutes ses parties, puis celles d'un mois. */
export interface RunHistory {
  /** Le mois lu (`aaaa-mm`). */
  readonly month: string;
  readonly previousMonth: string | null;
  readonly nextMonth: string | null;
  readonly playedCount: number;
  readonly averageScore: number | null;
  readonly bestScore: number | null;
  readonly runs: readonly RunHistoryEntry[];
}

/** Le filtre de la liste : toutes les setlists, ou celles d'une difficulté. */
export type DifficultyFilter = 'all' | RunDifficulty;

export const DIFFICULTY_FILTERS: readonly DifficultyFilter[] = ['all', 'easy', 'safe', 'risky'];

export function filterRuns(runs: readonly RunHistoryEntry[], filter: DifficultyFilter): readonly RunHistoryEntry[] {
  return filter === 'all' ? runs : runs.filter(run => run.difficulty === filter);
}

/** Un morceau raté : rien de trouvé, ou l'un des deux seulement. Un morceau retiré n'est pas raté (il ne comptait pas). */
export function isMissed(track: RunTrack): boolean {
  return !track.neutralized && !(track.artistCorrect && track.titleCorrect);
}

/** Les morceaux joués d'une partie, rangés par manche (dans l'ordre), les manches sans morceau à montrer écartées. */
export function tracksByRound(tracks: readonly RunTrack[], onlyMissed: boolean): readonly { readonly round: number; readonly tracks: readonly RunTrack[] }[] {
  const rounds = new Map<number, RunTrack[]>();
  for (const track of tracks) {
    if (onlyMissed && !isMissed(track)) continue;
    rounds.set(track.round, [...(rounds.get(track.round) ?? []), track]);
  }
  return [...rounds.entries()].sort(([a], [b]) => a - b).map(([round, list]) => ({ round, tracks: list }));
}

/** Le score de la dernière setlist finie ce jour-là (`aaaa-mm-jj`, UTC), les parties étant lues de la plus récente à la plus ancienne ; `null` sans partie ce jour-là. */
export function scoreOfDay(runs: readonly RunHistoryEntry[], day: string): number | null {
  return runs.find(run => run.date === day)?.score ?? null;
}
