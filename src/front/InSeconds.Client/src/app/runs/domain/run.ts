/**
 * Le mode Run en TypeScript pur : ce que le serveur rend d'une partie (la manche en cours, les morceaux joués, la fin) et les petits calculs que
 * les écrans en tirent (barre d'objectif, pastilles, libellés). Le serveur décide de tout (points, jauge, neutralisation, fin) : le front affiche.
 */

export type RunStatus = 'pending' | 'won' | 'lost' | 'abandoned';

/** Un morceau joué (ou neutralisé) : ce que la carte de réponse montre. Les noms ne viennent qu'avec la réponse (piège 31). */
export interface RunTrack {
  readonly position: number;
  readonly round: number;
  /** Retiré de la manche par le serveur (extrait introuvable) : 0 point, hors du maximum. */
  readonly neutralized: boolean;
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly points: number;
  readonly artist: string | null;
  readonly title: string | null;
  readonly coverUrl: string | null;
  readonly deezerTrackId: number | null;
}

/** La manche en cours : le score déjà marqué, l'objectif à atteindre pour la débloquer suivante, et le maximum possible. */
export interface RunRound {
  readonly round: number;
  readonly score: number;
  readonly objective: number;
  readonly maxScore: number;
}

export interface RunDisc {
  /** Clé de traduction du disque (`runs.discs.*`). */
  readonly key: string;
  readonly stars: number;
}

export interface RunRecord {
  readonly bestScore: number;
  readonly bestRoundsPassed: number;
  /** Cette partie vient d'établir le record. */
  readonly isNew: boolean;
}

/** Le score et l'objectif d'une manche à la fin de la partie ; vides si elle n'a pas été jouée. */
export interface RunRoundScore {
  readonly round: number;
  readonly score: number | null;
  readonly objective: number | null;
  readonly passed: boolean;
}

export interface RunFinish {
  readonly status: RunStatus;
  readonly disc: RunDisc;
  readonly totalScore: number;
  readonly roundsPassed: number;
  readonly foundCount: number;
  readonly trackCount: number;
  readonly tracks: readonly RunTrack[];
  readonly rounds: readonly RunRoundScore[];
  readonly record: RunRecord | null;
  readonly challengeCode: string;
}

export interface RunSession {
  readonly sessionId: number;
  readonly challengeCode: string;
  readonly status: RunStatus;
  readonly rounds: number;
  readonly tracksPerRound: number;
  readonly listenSeconds: number;
  readonly totalScore: number;
  readonly roundsPassed: number;
  /** La manche en cours ; vide une fois la partie finie. */
  readonly round: RunRound | null;
  /** Les morceaux déjà joués de la manche en cours (les pastilles), neutralisés compris. */
  readonly roundTracks: readonly RunTrack[];
  readonly finish: RunFinish | null;
}

/** Le morceau à jouer : l'extrait de ce seul morceau (jamais celui des suivants). */
export interface RunCurrentTrack {
  readonly position: number;
  readonly round: number;
  /** Sa place dans la manche, à partir de 1 (« Morceau 3 sur 5 »). */
  readonly positionInRound: number;
  readonly previewUrl: string | null;
}

export interface RunNeutralized {
  readonly position: number;
  readonly round: number;
  readonly objectiveBefore: number;
  readonly objectiveAfter: number;
}

/** Le bilan d'une manche qui vient de se terminer. */
export interface RunRoundSummary {
  readonly round: number;
  readonly passed: boolean;
  readonly score: number;
  readonly objective: number;
  readonly tracks: readonly RunTrack[];
  readonly totalScore: number;
}

/** Ce que rendent le lancement, la reprise, la redemande d'extrait et la réponse : l'état à jour, ce qui vient de se passer, le morceau à jouer. */
export interface RunPlay {
  readonly session: RunSession;
  /** Le morceau auquel le joueur vient de répondre (une réponse seulement). */
  readonly revealed: RunTrack | null;
  readonly neutralized: readonly RunNeutralized[];
  readonly roundSummaries: readonly RunRoundSummary[];
  readonly current: RunCurrentTrack | null;
  readonly isResuming: boolean;
}

export interface RunsMe {
  readonly hasAccess: boolean;
  readonly record: RunRecord | null;
  /** Une partie en cours : le joueur la reprend. */
  readonly pending: { readonly sessionId: number; readonly challengeCode: string } | null;
}

/** Ce que la barre d'objectif dessine : la part du maximum déjà marquée et l'emplacement du trait de l'objectif. */
export interface ObjectiveBar {
  readonly scoreRatio: number;
  readonly objectiveRatio: number;
}

const clampRatio = (value: number): number => Math.min(1, Math.max(0, value));

export function objectiveBar(round: Pick<RunRound, 'score' | 'objective' | 'maxScore'>): ObjectiveBar {
  if (round.maxScore <= 0) return { scoreRatio: 0, objectiveRatio: 0 };
  return { scoreRatio: clampRatio(round.score / round.maxScore), objectiveRatio: clampRatio(round.objective / round.maxScore) };
}

/** L'objectif est atteint : la manche suivante est débloquée. */
export const objectiveReached = (round: Pick<RunRound, 'score' | 'objective'>): boolean => round.score >= round.objective;

/** L'état d'une pastille de morceau. */
export type PillState = 'found' | 'half' | 'missed' | 'neutralized' | 'current' | 'todo';

/** Ce qu'un morceau déjà joué donne à sa pastille : tout trouvé, la moitié, rien, ou retiré de la manche. */
export function pillOf(track: Pick<RunTrack, 'neutralized' | 'artistCorrect' | 'titleCorrect'>): PillState {
  if (track.neutralized) return 'neutralized';
  if (track.artistCorrect && track.titleCorrect) return 'found';
  return track.artistCorrect || track.titleCorrect ? 'half' : 'missed';
}

/**
 * Les pastilles d'une manche, une par morceau : les morceaux joués (dans l'ordre), puis le morceau en cours (corail) s'il y en a un, puis ceux
 * qui restent. `answered` est dans l'ordre de la manche.
 */
export function trackPills(tracksPerRound: number, answered: readonly Pick<RunTrack, 'neutralized' | 'artistCorrect' | 'titleCorrect'>[], hasCurrent: boolean): PillState[] {
  return Array.from({ length: tracksPerRound }, (_, index): PillState => {
    if (index < answered.length) return pillOf(answered[index]);
    return index === answered.length && hasCurrent ? 'current' : 'todo';
  });
}

/** « +67 » : les points gagnés sur un morceau. */
export const gainLabel = (points: number): string => `+${points}`;

/** La partie est finie (gagnée, perdue ou abandonnée). */
export const isFinished = (session: Pick<RunSession, 'status'>): boolean => session.status !== 'pending';

/** Le dernier morceau de la manche vient d'être répondu : le bilan de la manche suit. */
export const endsRound = (play: Pick<RunPlay, 'roundSummaries'>): boolean => play.roundSummaries.length > 0;
