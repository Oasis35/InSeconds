/**
 * Le mode Run en TypeScript pur : ce que le serveur rend d'une partie (la manche en cours, les morceaux joués, la fin) et les petits calculs que
 * les écrans en tirent (barre d'objectif, pastilles, libellés). Le serveur décide de tout (points, jauge, neutralisation, fin) : le front affiche.
 */

import { RunCardOffer, RunHandCard } from './run-cards';

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
  /** La forme de l'extrait (blob en base64) : seulement dans la pile rendue au lancement et à la reprise, `null` sinon. */
  readonly waveform: string | null;
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
  /** Les morceaux déjà joués de la manche en cours, neutralisés compris. */
  readonly roundTracks: readonly RunTrack[];
  readonly finish: RunFinish | null;
  /** Le chrono d'un morceau, en secondes, du premier son à la réponse ; 0 : pas de chrono (playlist d'avant le chrono). */
  readonly answerSeconds: number;
  /** Ce qu'il reste au chrono du morceau en cours, s'il a démarré ; `null` sinon (il part au premier son). */
  readonly clockRemainingSeconds: number | null;
  /** Tous les morceaux déjà joués de la partie, dans l'ordre (la pile), neutralisés compris. */
  readonly playedTracks: readonly RunTrack[];
  /** Les manches passées, dans l'ordre, avec le disque gagné à chacune (les lignes de palier de la pile). */
  readonly passedRounds: readonly RunPassedRound[];
  /**
   * La difficulté de la manche en cours, tant qu'elle reste à choisir (avant son premier son) ; `null` sinon. Son premier morceau n'arrive
   * qu'avec le choix.
   */
  readonly difficultyChoice: RunDifficultyChoice | null;
  /** Les cartes en main (vide sans coups de pouce). */
  readonly hand: readonly RunHandCard[];
  /** L'offre du palier, tant qu'elle est ouverte. */
  readonly offer: RunCardOffer | null;
  /** Les emplacements de la main ; 0 : une playlist sans coups de pouce (pas d'écran de palier). */
  readonly handSize: number;
  /** Le disque que la manche en cours fait gagner si elle est passée ; `null` une fois la partie finie. */
  readonly nextDisc: RunDisc | null;
}

/** Une difficulté de manche : objectif et plafond plus ou moins hauts. */
export type RunDifficulty = 'easy' | 'safe' | 'risky';

/** Les difficultés proposées pour la manche en cours (l'écran « Difficulté ? »). */
export interface RunDifficultyChoice {
  readonly round: number;
  readonly options: readonly RunDifficultyOption[];
}

/** Une colonne de l'écran « Difficulté ? » : l'objectif (le cadenas), le plafond (la hauteur), l'écoute d'un morceau. */
export interface RunDifficultyOption {
  readonly difficulty: RunDifficulty;
  readonly objective: number;
  readonly maxScore: number;
  readonly listenSeconds: number;
}

/** Une manche passée : son score, son objectif et le disque qu'elle donne. */
export interface RunPassedRound {
  readonly round: number;
  readonly score: number;
  readonly objective: number;
  readonly disc: RunDisc;
}

/** Le morceau à jouer : l'extrait de ce seul morceau (jamais celui des suivants). */
export interface RunCurrentTrack {
  readonly position: number;
  readonly round: number;
  /** Sa place dans la manche, à partir de 1 (« Morceau 3 sur 5 »). */
  readonly positionInRound: number;
  readonly previewUrl: string | null;
  /** Son écoute fixe (la difficulté de la manche la change : la manche boss est plus courte) ; absente, celle de la partie. */
  readonly listenSeconds?: number;
  /** La forme de l'extrait calculée par l'API (blob en base64) ; `null` si elle n'est pas prête : le navigateur calcule la sienne. */
  readonly waveform?: string | null;
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
  /** Le chrono de chaque morceau ; 0 : pas de chrono. */
  readonly answerSeconds: number;
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

/** « +67 » : les points gagnés sur un morceau. */
export const gainLabel = (points: number): string => `+${points}`;

/** La partie est finie (gagnée, perdue ou abandonnée). */
export const isFinished = (session: Pick<RunSession, 'status'>): boolean => session.status !== 'pending';


/**
 * Une étape à montrer avant de reprendre la partie, dans l'ordre où le serveur l'a jouée : la réponse au morceau (révélée dans la carte), un
 * morceau retiré de la manche (carte « Morceau retiré »). Chacune porte la manche telle que l'en-tête la montre à ce moment-là : les étapes
 * suivantes ne se voient pas avant leur tour. La fin d'une manche n'est pas une étape : sa ligne de palier se pose dans la pile.
 */
export type RunStep =
  | { readonly kind: 'revealed'; readonly track: RunTrack; readonly round: RunRound }
  | {
    readonly kind: 'neutralized';
    readonly position: number;
    /** L'objectif de la manche avant le retrait du morceau. */
    readonly objectiveBefore: number;
    readonly round: RunRound;
  };

/** La position du morceau d'une étape. */
export const stepPosition = (step: RunStep): number => (step.kind === 'revealed' ? step.track.position : step.position);

/**
 * Les étapes qu'une réponse du serveur (lancement, reprise, extrait redemandé, réponse) fait passer au joueur. `before` est la manche affichée
 * avant la requête (elle donne le maximum de points de la manche, que le bilan et les retraits ne portent pas).
 *
 * Le serveur enchaîne en une fois ce qu'il peut : la réponse, puis les morceaux suivants qu'il retire faute d'extrait. Le maximum d'une manche
 * dont on a retiré un morceau se déduit de son objectif (l'objectif est une part fixe du maximum).
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

  const events = [
    ...(play.revealed ? [{ position: play.revealed.position, round: play.revealed.round, item: null }] : []),
    ...play.neutralized.map(item => ({ position: item.position, round: item.round, item })),
  ].sort((a, b) => a.position - b.position);

  return events.map((event): RunStep => {
    const roundNumber = event.round;
    if (event.item) {
      const objective = event.item.objectiveAfter;
      const round = { round: roundNumber, score: scoreOf(roundNumber), objective, maxScore: maxFor(roundNumber, objective) };
      return { kind: 'neutralized', position: event.position, objectiveBefore: event.item.objectiveBefore, round };
    }
    // La réponse se montre avec l'objectif d'avant les retraits qui la suivent dans la même manche.
    const objective = play.neutralized.find(n => n.round === roundNumber)?.objectiveBefore
      ?? summaryOf(roundNumber)?.objective ?? sessionRound(roundNumber)?.objective ?? before?.objective ?? 0;
    const maxScore = before?.round === roundNumber ? before.maxScore : maxFor(roundNumber, objective);
    return { kind: 'revealed', track: play.revealed!, round: { round: roundNumber, score: scoreOf(roundNumber), objective, maxScore } };
  });
}

/** Un segment de la barre du run (une manche) : passée, en cours (remplie de son score, avec le trait de l'objectif), ou pas encore ouverte. */
export interface RunSegment {
  readonly state: 'done' | 'current' | 'locked';
  /** La part remplie, de 0 à 1. */
  readonly fill: number;
  /** L'emplacement du trait de l'objectif, de 0 à 1 ; seulement sur la manche en cours. */
  readonly mark: number | null;
}

/** La barre du run : un segment par manche. */
export function runSegments(rounds: number, shown: Pick<RunRound, 'round' | 'score' | 'objective' | 'maxScore'> | null): RunSegment[] {
  return Array.from({ length: rounds }, (_, index): RunSegment => {
    const number = index + 1;
    if (!shown || number > shown.round) return { state: 'locked', fill: 0, mark: null };
    if (number < shown.round) return { state: 'done', fill: 1, mark: null };
    const bar = objectiveBar(shown);
    return { state: 'current', fill: bar.scoreRatio, mark: bar.objectiveRatio };
  });
}

/**
 * L'écran de palier est dû : la playlist a des coups de pouce, la manche précédente vient d'être passée, et le serveur dit que la manche en cours
 * attend encore le joueur (son offre est ouverte ou sa difficulté reste à choisir : rien n'y a commencé), sauf si le joueur l'a déjà quitté par
 * « Suite » (`dismissedFor`, la manche qu'il a ouverte).
 */
export function palierDue(session: RunSession, dismissedFor: number | null): boolean {
  const round = session.round;
  if (session.status !== 'pending' || session.handSize <= 0 || !round || round.round < 2 || dismissedFor === round.round) return false;
  return (session.offer !== null || session.difficultyChoice !== null) && session.roundTracks.length === 0
    && session.passedRounds.some(p => p.round === round.round - 1);
}

/** L'objectif de la manche à venir montré au palier : celui de « Sûre » (la difficulté se choisit ensuite), sinon celui de la manche. */
export function nextObjective(session: RunSession): number {
  return session.difficultyChoice?.options.find(o => o.difficulty === 'safe')?.objective ?? session.round?.objective ?? 0;
}

/** Les points qui manquent pour passer la manche (0 : objectif atteint). */
export const pointsToGo = (round: Pick<RunRound, 'score' | 'objective'>): number => Math.max(0, round.objective - round.score);

/** Une ligne de la pile : un morceau joué (sous une ligne de palier, il ne garde que pochette, forme et points), ou la ligne d'une manche passée. */
export type PileEntry =
  | { readonly kind: 'track'; readonly track: RunTrack; readonly past: boolean }
  | { readonly kind: 'palier'; readonly passed: RunPassedRound };

/**
 * La pile du run, le plus récent en haut : les morceaux de la manche en cours, puis pour chaque manche passée sa ligne de palier et ses morceaux.
 * `hideFrom` : l'étape à l'écran ; son morceau et les suivants ne sont pas encore dans la pile (celui qu'on révèle, les retraits qui le
 * suivent), ni la ligne de sa manche et des suivantes.
 */
export function runPile(
  tracks: readonly RunTrack[], passed: readonly RunPassedRound[], hideFrom: { readonly position: number; readonly round: number } | null = null,
): PileEntry[] {
  const shown = tracks.filter(t => hideFrom === null || t.position < hideFrom.position);
  const hiddenRound = hideFrom?.round ?? null;
  const rounds = new Set<number>([...shown.map(t => t.round), ...passed.map(p => p.round)]);
  const entries: PileEntry[] = [];
  for (const round of [...rounds].sort((a, b) => b - a)) {
    const line = passed.find(p => p.round === round && (hiddenRound === null || p.round < hiddenRound));
    if (line) entries.push({ kind: 'palier', passed: line });
    shown.filter(t => t.round === round).sort((a, b) => b.position - a.position)
      .forEach(track => entries.push({ kind: 'track', track, past: line !== undefined }));
  }
  return entries;
}

/** « 0:45 » : le temps qui reste au chrono, en minutes et secondes. */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** L'enchaînement automatique après une réponse ou un morceau retiré, en ms : le temps de voir la réponse (« Morceau suivant » l'avance). */
export const AUTO_NEXT_MS = 2000;

/** Les dernières secondes du chrono : gros chiffre blanc, bord de la carte éclairci, tic. */
export const CLOCK_ALERT_SECONDS = 5;

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
