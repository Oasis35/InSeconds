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

/** Ce que montre le lien d'une playlist (écran « lien reçu ») : jamais un morceau (piège 31), ni le nombre de joueurs. */
export interface RunLink {
  readonly code: string;
  /** Le pseudo de son auteur ; `null` pour un invité (« Invité » à l'écran). */
  readonly authorPseudo: string | null;
  readonly trackCount: number;
  readonly rounds: number;
  readonly tracksPerRound: number;
  readonly listenSeconds: number;
  /** La partie de ce joueur sur la playlist : pas jouée, en cours, ou finie. */
  readonly myStatus: 'none' | RunStatus;
  readonly mySessionId: number | null;
}

/** Une partie terminée d'une playlist, dans le tableau de comparaison. */
export interface RunComparisonRow {
  /** `null` pour un invité. */
  readonly pseudo: string | null;
  readonly disc: RunDisc;
  /** Le score de chaque manche de la playlist ; `null` pour une manche non jouée (✕). */
  readonly rounds: readonly (number | null)[];
  readonly totalScore: number;
  /** C'est la partie du joueur qui regarde (« Toi »). */
  readonly isMe: boolean;
}

/** Les joueurs d'une playlist, triés par total, après la fin de sa propre partie. */
export interface RunComparison {
  readonly code: string;
  readonly authorPseudo: string | null;
  readonly playerCount: number;
  readonly roundCount: number;
  readonly rows: readonly RunComparisonRow[];
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


/**
 * Une étape à montrer avant de reprendre la partie, dans l'ordre où le serveur l'a jouée : la réponse au morceau (carte de réponse), un morceau
 * retiré de la manche (carte « Morceau retiré »), le bilan d'une manche terminée. Chacune porte la manche telle que l'écran la montre à ce
 * moment-là (bloc objectif, pastilles) : les étapes suivantes ne se voient pas avant leur tour.
 */
export type RunStep =
  | { readonly kind: 'revealed'; readonly track: RunTrack; readonly round: RunRound; readonly tracks: readonly RunTrack[] }
  | {
    readonly kind: 'neutralized';
    readonly position: number;
    /** L'objectif de la manche avant le retrait du morceau : barré à côté du nouveau. */
    readonly objectiveBefore: number;
    readonly round: RunRound;
    readonly tracks: readonly RunTrack[];
  }
  | { readonly kind: 'summary'; readonly summary: RunRoundSummary; readonly round: RunRound };

/** Un morceau retiré, tel que les pastilles le voient (rien ne le révèle). */
const withdrawnTrack = (item: RunNeutralized): RunTrack => ({
  position: item.position, round: item.round, neutralized: true, artistCorrect: false, titleCorrect: false, points: 0,
  artist: null, title: null, coverUrl: null, deezerTrackId: null,
});

/**
 * Les étapes qu'une réponse du serveur (lancement, reprise, extrait redemandé, réponse) fait passer au joueur, chacune derrière un clic : le son
 * ne repart jamais seul. `before` est la manche affichée avant la requête (elle donne le maximum de points de la manche, que le bilan et les
 * retraits ne portent pas).
 *
 * Le serveur enchaîne en une fois ce qu'il peut : la réponse, puis les morceaux suivants qu'il retire faute d'extrait, et le bilan de chaque
 * manche que cela termine. Le bilan d'une manche suit son dernier morceau ; le maximum d'une manche dont on a retiré un morceau se déduit de
 * son objectif (l'objectif est une part fixe du maximum).
 */
export function playSteps(
  play: Pick<RunPlay, 'session' | 'revealed' | 'neutralized' | 'roundSummaries'>,
  before: RunRound | null,
): RunStep[] {
  const { session } = play;
  const summaryOf = (round: number) => play.roundSummaries.find(s => s.round === round);
  const sessionRound = (round: number) => (session.round?.round === round ? session.round : null);
  /** Une manche dont on connaît le maximum : celle où la partie en est, ou celle qu'on affichait. */
  const baseOf = (round: number) => sessionRound(round) ?? (before?.round === round ? before : null);
  const maxFor = (round: number, objective: number): number => {
    const base = baseOf(round);
    if (!base) return 0;
    return base.objective > 0 ? Math.round((objective * base.maxScore) / base.objective) : base.maxScore;
  };
  const scoreOf = (round: number) => summaryOf(round)?.score ?? sessionRound(round)?.score ?? (before?.round === round ? before.score : 0);
  const playedUpTo = (track: RunTrack): RunTrack[] => {
    const source = summaryOf(track.round)?.tracks ?? (sessionRound(track.round) ? session.roundTracks : []);
    const played = source.filter(t => t.round === track.round && t.position <= track.position);
    return played.some(t => t.position === track.position) ? played : [...played, track];
  };

  const events = [
    ...(play.revealed ? [{ track: play.revealed, item: null }] : []),
    ...play.neutralized.map(item => ({ track: withdrawnTrack(item), item })),
  ].sort((a, b) => a.track.position - b.track.position);

  const steps: RunStep[] = [];
  const shown = new Set<number>();
  events.forEach((event, index) => {
    const roundNumber = event.track.round;
    const tracks = playedUpTo(event.track);
    let round: RunRound;
    if (event.item) {
      const objective = event.item.objectiveAfter;
      round = { round: roundNumber, score: scoreOf(roundNumber), objective, maxScore: maxFor(roundNumber, objective) };
      steps.push({ kind: 'neutralized', position: event.track.position, objectiveBefore: event.item.objectiveBefore, round, tracks });
    } else {
      // La réponse se montre avec l'objectif d'avant les retraits qui la suivent dans la même manche.
      const objective = play.neutralized.find(n => n.round === roundNumber)?.objectiveBefore
        ?? summaryOf(roundNumber)?.objective ?? sessionRound(roundNumber)?.objective ?? before?.objective ?? 0;
      const maxScore = before?.round === roundNumber ? before.maxScore : maxFor(roundNumber, objective);
      round = { round: roundNumber, score: scoreOf(roundNumber), objective, maxScore };
      steps.push({ kind: 'revealed', track: event.track, round, tracks });
    }
    const summary = summaryOf(roundNumber);
    if (summary && events[index + 1]?.track.round !== roundNumber) {
      shown.add(roundNumber);
      steps.push({ kind: 'summary', summary, round: { round: roundNumber, score: summary.score, objective: summary.objective, maxScore: round.maxScore } });
    }
  });
  // Un bilan sans morceau devant lui (ne devrait pas arriver) : montré quand même, à la fin.
  for (const summary of play.roundSummaries) {
    if (!shown.has(summary.round)) {
      steps.push({ kind: 'summary', summary, round: { round: summary.round, score: summary.score, objective: summary.objective, maxScore: maxFor(summary.round, summary.objective) } });
    }
  }
  return steps;
}

/** Combien de morceaux de la partie sont déjà joués (l'écran de reprise) : les manches passées, puis ceux de la manche en cours. */
export const playedCount = (session: Pick<RunSession, 'round' | 'tracksPerRound' | 'roundTracks'>): number =>
  session.round ? (session.round.round - 1) * session.tracksPerRound + session.roundTracks.length : 0;

/** Un carré de l'écran de fin : morceau trouvé (artiste et titre), joué sans être trouvé, retiré de la manche, ou pas joué. */
export type FinishSquare = 'found' | 'played' | 'neutralized' | 'unplayed';

/** Les carrés de l'écran de fin, un par morceau de la playlist, groupés par manche ; une manche non jouée n'a que des carrés vides. */
export function finishSquares(finish: Pick<RunFinish, 'tracks' | 'rounds' | 'trackCount'>): FinishSquare[][] {
  const roundCount = Math.max(1, finish.rounds.length);
  const perRound = Math.ceil(finish.trackCount / roundCount);
  return Array.from({ length: roundCount }, (_, index) => {
    const played = finish.tracks.filter(t => t.round === index + 1).sort((a, b) => a.position - b.position);
    return Array.from({ length: perRound }, (_, slot): FinishSquare => {
      const track = played[slot];
      if (!track) return 'unplayed';
      if (track.neutralized) return 'neutralized';
      return track.artistCorrect && track.titleCorrect ? 'found' : 'played';
    });
  });
}
