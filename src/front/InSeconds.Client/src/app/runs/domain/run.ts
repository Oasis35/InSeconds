/**
 * Le mode Run en TypeScript pur : ce que le serveur rend d'une partie (la manche en cours, les morceaux joués, la fin) et les petits calculs que
 * les écrans en tirent (barre d'objectif, pastilles, libellés). Le serveur décide de tout (points, jauge, neutralisation, fin) : le front affiche.
 */

/** Une partie de la Série ne se gagne pas : elle se perd à la dernière vie, ou s'abandonne. */
export type RunStatus = 'pending' | 'lost' | 'abandoned';

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

/**
 * La manche en cours : le score déjà marqué, l'écoute de ses morceaux (le palier), ce qu'un morceau trouvé en entier rapporte ici et combien de
 * morceaux y ont été ratés.
 */
export interface RunRound {
  readonly round: number;
  readonly score: number;
  readonly listenSeconds: number;
  readonly fullPoints: number;
  readonly failed: number;
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

/** Le score d'une manche à la fin de la partie, son palier d'écoute et son thème ; vide si elle n'a pas été jouée. */
export interface RunRoundScore {
  readonly round: number;
  readonly score: number | null;
  readonly listenSeconds: number;
  readonly theme: string | null;
}

export interface RunFinish {
  readonly status: RunStatus;
  readonly totalScore: number;
  readonly roundsPassed: number;
  readonly foundCount: number;
  readonly trackCount: number;
  readonly tracks: readonly RunTrack[];
  readonly rounds: readonly RunRoundScore[];
  readonly record: RunRecord | null;
  readonly challengeCode: string;
  /** Le niveau du joueur après cette partie ; `null` pour une partie abandonnée ou un serveur qui ne l'envoie pas. */
  readonly level: RunLevel | null;
}

/**
 * Le niveau du joueur : ses points (la moyenne de ses dernières parties, ils montent et descendent), son disque, le suivant et ce qui manque pour
 * l'avoir (`null` au dernier disque), sa progression entre les deux (de 0 à 100), « provisoire » tant qu'il a fini trop peu de parties, et ce que la
 * dernière partie a changé (`null` hors de l'écran de fin).
 */
export interface RunLevel {
  readonly points: number;
  readonly disc: RunDisc;
  readonly nextDisc: RunDisc | null;
  readonly pointsToNext: number | null;
  readonly progressPercent: number;
  readonly provisional: boolean;
  readonly runsPlayed: number;
  readonly delta: number | null;
}

/** « +38 », « −12 » : ce que la partie a changé au niveau ; rien pour un niveau inchangé ou inconnu. */
export function levelDeltaText(delta: number | null, format: (value: number) => string): string | null {
  if (delta === null || delta === 0) return null;
  return delta > 0 ? `+${format(delta)}` : `−${format(-delta)}`;
}

export interface RunSession {
  readonly sessionId: number;
  readonly challengeCode: string;
  readonly status: RunStatus;
  readonly tracksPerRound: number;
  /** Les vies de départ et celles qui restent : un morceau raté, passé ou arrivé au bout du chrono en coûte une. */
  readonly lives: number;
  readonly livesLeft: number;
  readonly totalScore: number;
  /** Les manches terminées avec au moins une vie. */
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
  /** Les manches terminées, dans l'ordre, avec leur score et le palier d'écoute joué (les lignes de manche de la pile). */
  readonly passedRounds: readonly RunPassedRound[];
  /** Le thème de la manche en cours, tant qu'il reste à choisir (le premier joueur qui y arrive) ; `null` sinon. */
  readonly themeChoice: RunThemeChoice | null;
  /** Le fantôme de l'ami qui a lancé la playlist, s'il l'a finie ; `null` sinon (sa propre playlist, rien encore répondu). */
  readonly ghost: RunGhost | null;
  /** Les manches à thème de la playlist (jamais la première) ; vide : aucune. */
  readonly themes: readonly RunTheme[];
}

/** Une manche terminée : son score, le palier d'écoute joué et son thème s'il y en avait un. */
export interface RunPassedRound {
  readonly round: number;
  readonly score: number;
  readonly listenSeconds: number;
  readonly theme: string | null;
}

/** Le morceau à jouer : l'extrait de ce seul morceau (jamais celui des suivants). */
export interface RunCurrentTrack {
  readonly position: number;
  readonly round: number;
  /** Sa place dans la manche, à partir de 1 (« Morceau 3 sur 5 »). */
  readonly positionInRound: number;
  readonly previewUrl: string | null;
  /** Son écoute fixe : le palier de la manche. */
  readonly listenSeconds: number;
  /** La forme de l'extrait calculée par l'API (blob en base64) ; `null` si elle n'est pas prête : le navigateur calcule la sienne. */
  readonly waveform?: string | null;
}

/** Un morceau retiré de la manche par le serveur (extrait introuvable). */
export interface RunNeutralized {
  readonly position: number;
  readonly round: number;
}

/** Comment une manche s'est terminée : son palier raccourci (sans erreur), gardé (une erreur au premier palier) ou rallongé (une erreur). */
export type RunRoundOutcome = 'shorter' | 'same' | 'longer';

/** Le bilan d'une manche qui vient de se terminer, avec ce qui attend le joueur : le palier de la suivante. */
export interface RunRoundSummary {
  readonly round: number;
  readonly score: number;
  readonly outcome: RunRoundOutcome;
  readonly listenSeconds: number;
  readonly nextListenSeconds: number;
  readonly tracks: readonly RunTrack[];
  readonly totalScore: number;
  readonly livesLeft: number;
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
/** La manche à thème d'une playlist (jamais la première) : son numéro et le nom du thème tel qu'il était à la création de la playlist. */
export interface RunTheme {
  readonly round: number;
  readonly name: string;
}

/** Un thème proposé au créateur d'une playlist, juste avant la manche à thème. */
export interface RunThemeOffer {
  readonly id: number;
  readonly name: string;
  /** La manche qui aura ce thème. */
  readonly round: number;
  /** Le nom Lucide de son icône (stock de `ui/theme-icon`) ; `null` : aucune. */
  readonly icon: string | null;
}

/** Le choix du thème de la manche, en attente avant son premier morceau : deux thèmes, le troisième choix (« Thème mystère ») se tire côté serveur. */
export interface RunThemeChoice {
  readonly round: number;
  readonly themes: readonly RunThemeOffer[];
}

export interface RunLink {
  readonly code: string;
  /** Le pseudo de son auteur ; `null` pour un invité (« Invité » à l'écran). */
  readonly authorPseudo: string | null;
  readonly lives: number;
  readonly tracksPerRound: number;
  /** Le palier de la première manche. */
  readonly listenSeconds: number;
  /** Le chrono de chaque morceau ; 0 : pas de chrono. */
  readonly answerSeconds: number;
  /** La partie de ce joueur sur la playlist : pas jouée, en cours, ou finie. */
  readonly myStatus: 'none' | RunStatus;
  readonly mySessionId: number | null;
  /** Les manches à thème de la playlist ; vide : aucune. */
  readonly themes: readonly RunTheme[];
}

/** Une partie terminée d'une playlist, dans le tableau de comparaison. */
export interface RunComparisonRow {
  /** `null` pour un invité. */
  readonly pseudo: string | null;
  /** Les manches terminées avant la dernière vie perdue. */
  readonly roundsPassed: number;
  /** Le score de chaque manche de la playlist ; `null` pour une manche non jouée (✕). */
  readonly rounds: readonly (number | null)[];
  readonly totalScore: number;
  /** C'est la partie du joueur qui regarde (« Toi »). */
  readonly isMe: boolean;
  /** Le repère grisé qui distingue deux joueurs de même pseudo dans ce tableau ; `null` sans homonyme. */
  readonly tag: string | null;
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
  /** Son niveau ; `null` avant sa première partie finie. */
  readonly level: RunLevel | null;
  /** Le défi d'un ami qui attend d'être joué (bandeau violet de la carte Setlist) ; `null` sans défi, refusé ou expiré. */
  readonly received: RunReceivedChallenge | null;
}

/** La playlist d'un ami que le joueur a ouverte par son lien et pas encore jouée : « Léa t'a défié · 2 140 à battre · expire dans 6 j ». */
export interface RunReceivedChallenge {
  readonly code: string;
  /** Le pseudo de l'ami ; `null` pour un invité (« Un ami » à l'écran). */
  readonly authorPseudo: string | null;
  /** Son total, quand il a fini la playlist ; `null` sinon. */
  readonly scoreToBeat: number | null;
  /** Quand le défi expire (7 jours après sa réception), en ISO 8601. */
  readonly expiresAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Les jours qui restent à un défi reçu, arrondis au-dessus (« expire dans 1 j » jusqu'au bout) ; jamais moins de 1. */
export function daysLeft(expiresAt: string, now: Date): number {
  const left = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
  return Math.max(1, Number.isFinite(left) ? left : 1);
}

/** « +67 » : les points gagnés sur un morceau. */
export const gainLabel = (points: number): string => `+${points}`;

/** La partie est finie (gagnée, perdue ou abandonnée). */
export const isFinished = (session: Pick<RunSession, 'status'>): boolean => session.status !== 'pending';


/**
 * Une étape à montrer avant de reprendre la partie, dans l'ordre où le serveur l'a jouée : la réponse au morceau (révélée dans la carte), un
 * morceau retiré de la manche (carte « Morceau retiré »). Chacune porte sa manche. La fin d'une manche n'est pas une étape : son bilan s'affiche
 * ensuite (`roundEndOf`) et sa ligne se pose dans la pile.
 */
export type RunStep =
  | { readonly kind: 'revealed'; readonly track: RunTrack; readonly round: number }
  | { readonly kind: 'neutralized'; readonly position: number; readonly round: number };

/** La position du morceau d'une étape. */
export const stepPosition = (step: RunStep): number => (step.kind === 'revealed' ? step.track.position : step.position);

/**
 * Les étapes qu'une réponse du serveur (lancement, reprise, extrait redemandé, réponse) fait passer au joueur : la réponse, puis les morceaux
 * suivants que le serveur retire faute d'extrait, dans l'ordre des positions.
 */
export function playSteps(play: Pick<RunPlay, 'revealed' | 'neutralized'>): RunStep[] {
  const events: RunStep[] = [
    ...(play.revealed ? [{ kind: 'revealed', track: play.revealed, round: play.revealed.round } as const] : []),
    ...play.neutralized.map((item): RunStep => ({ kind: 'neutralized', position: item.position, round: item.round })),
  ];
  return events.sort((a, b) => stepPosition(a) - stepPosition(b));
}

/**
 * Le bilan de la manche que cette réponse vient de finir, à montrer après ses étapes et avant la manche suivante ; `null` quand aucune manche ne
 * s'est terminée ou que la partie est finie (la fin s'affiche à sa place). À la reprise (`isResuming`), rien : le joueur retrouve sa manche.
 */
export function roundEndOf(play: Pick<RunPlay, 'session' | 'roundSummaries' | 'isResuming'>): RunRoundSummary | null {
  if (play.isResuming || play.session.status !== 'pending') return null;
  return play.roundSummaries.at(-1) ?? null;
}

/** Les vies de la barre du run : une pastille par vie de départ, pleine tant qu'elle reste. */
export const lifeDots = (lives: number, livesLeft: number): boolean[] =>
  Array.from({ length: Math.max(0, lives) }, (_, index) => index < livesLeft);

/** Ce que le bilan d'une manche dit du palier suivant : plus court, le même, plus long. */
export const outcomeKey = (outcome: RunRoundOutcome): string => `runs.roundEnd.${outcome}`;

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

/** Un carré de l'écran de fin : morceau trouvé (artiste et titre), joué sans être trouvé, retiré de la manche, ou pas joué. */
export type FinishSquare = 'found' | 'played' | 'neutralized' | 'unplayed';

/** Les carrés de l'écran de fin, un par morceau de la playlist, groupés par manche ; une manche non jouée n'a que des carrés vides. */
export function finishSquares(finish: Pick<RunFinish, 'tracks' | 'rounds' | 'trackCount'>): FinishSquare[][] {
  const roundCount = Math.max(1, finish.rounds.length);
  const perRound = Math.ceil(finish.trackCount / roundCount);
  return Array.from({ length: roundCount }, (_, index) => {
    const played = tracksOfRound(finish.tracks, index + 1);
    return Array.from({ length: perRound }, (_, slot): FinishSquare => {
      const track = played[slot];
      if (!track) return 'unplayed';
      const mark = trackMark(track);
      if (mark === 'withdrawn') return 'neutralized';
      return mark === 'found' ? 'found' : 'played';
    });
  });
}

/** Un morceau joué, vu de la fin et du partage : trouvé (artiste et titre), à moitié (l'un des deux), raté, ou retiré de la manche. */
export type RunTrackMark = 'found' | 'half' | 'missed' | 'withdrawn';

/** Le seul endroit qui dit ce qu'est un morceau trouvé : l'écran de fin et le partage en grille le lisent tous deux. */
export function trackMark(track: Pick<RunTrack, 'neutralized' | 'artistCorrect' | 'titleCorrect'>): RunTrackMark {
  if (track.neutralized) return 'withdrawn';
  if (track.artistCorrect && track.titleCorrect) return 'found';
  return track.artistCorrect || track.titleCorrect ? 'half' : 'missed';
}

/** Les morceaux joués d'une manche, dans l'ordre. */
export const tracksOfRound = <T extends Pick<RunTrack, 'round' | 'position'>>(tracks: readonly T[], round: number): T[] =>
  tracks.filter(track => track.round === round).sort((a, b) => a.position - b.position);

/** Les cases du partage, comme le partage du Daily : un carré par morceau. */
export const RUN_SHARE_EMOJI: Readonly<Record<RunTrackMark, string>> = { found: '🟩', half: '🟨', missed: '🟥', withdrawn: '⬜' };

/** Une ligne du partage : une manche jouée, son palier d'écoute et un carré par morceau joué. */
export interface RunShareRound {
  readonly round: number;
  readonly listenSeconds: number;
  readonly marks: readonly RunTrackMark[];
}

/** Les lignes du partage en grille : les manches jouées seulement, dans l'ordre, chaque morceau joué à sa place. */
export function shareRounds(finish: Pick<RunFinish, 'tracks' | 'rounds'>): RunShareRound[] {
  return finish.rounds
    .filter(round => round.score !== null)
    .map(round => ({ round: round.round, listenSeconds: round.listenSeconds, marks: tracksOfRound(finish.tracks, round.round).map(trackMark) }));
}

/** Le fantôme d'un ami sur la même playlist : son total sur les morceaux que le joueur a joués, jusqu'au dernier répondu (rien d'avance). */
export interface RunGhost {
  /** Son pseudo ; `null` pour un invité (« Invité » à l'écran). */
  readonly pseudo: string | null;
  readonly total: number;
  /** La manche où sa partie s'est arrêtée, quand le joueur est allé plus loin ; `null` sinon. */
  readonly stoppedAtRound: number | null;
}

/** L'écart avec le fantôme au dernier morceau répondu : son total à ce morceau, et l'avance (positive) ou le retard (négatif) du joueur. */
export interface RunGhostGap {
  readonly pseudo: string | null;
  readonly total: number;
  readonly gap: number;
  readonly stoppedAtRound: number | null;
}

/** L'écart avec le fantôme, morceau par morceau ; `null` sans fantôme (le serveur n'en envoie pas avant le premier morceau joué). */
export function ghostGap(session: Pick<RunSession, 'ghost' | 'totalScore'> | null): RunGhostGap | null {
  const ghost = session?.ghost;
  if (!ghost) return null;
  return { pseudo: ghost.pseudo, total: ghost.total, gap: session.totalScore - ghost.total, stoppedAtRound: ghost.stoppedAtRound };
}

/** Le duel de l'écran de fin : le joueur face à l'ami qui a lancé la playlist (sur les morceaux que le joueur a joués). */
export interface RunDuel {
  /** Le pseudo de l'ami ; `null` pour un invité (« Invité » à l'écran). */
  readonly pseudo: string | null;
  /** L'avance (positive) ou le retard (négatif) du joueur, en points ; 0 : égalité. */
  readonly gap: number;
}

/**
 * Le duel d'une partie finie (gagnée ou perdue) sur la playlist d'un ami qui l'a finie ; `null` sans ami (sa propre playlist, un ami qui n'est pas
 * arrivé au bout) et pour une partie abandonnée.
 */
export function duelOf(session: Pick<RunSession, 'ghost' | 'totalScore' | 'status'> | null): RunDuel | null {
  if (!session || session.status !== 'lost') return null;
  const gap = ghostGap(session);
  return gap ? { pseudo: gap.pseudo, gap: gap.gap } : null;
}

/** À partir de combien de bonnes réponses d'affilée la série s'affiche. */
export const COMBO_MIN = 2;

/**
 * La série en cours : les derniers morceaux trouvés (artiste et titre) d'affilée, toutes manches confondues. Un morceau retiré ne la casse pas
 * (le joueur n'y est pour rien) ; un morceau raté ou à moitié trouvé la remet à zéro. Elle ne rapporte aucun point : elle se voit, c'est tout.
 */
export function comboOf(tracks: readonly Pick<RunTrack, 'position' | 'neutralized' | 'artistCorrect' | 'titleCorrect'>[]): number {
  const played = [...tracks].sort((a, b) => b.position - a.position);
  let combo = 0;
  for (const track of played) {
    const mark = trackMark(track);
    if (mark === 'withdrawn') continue;
    if (mark !== 'found') break;
    combo++;
  }
  return combo;
}

/**
 * Où en est une partie, vu du serveur : son statut, ses morceaux joués, le choix de thème en attente. Deux relectures
 * différentes disent qu'elle a avancé ailleurs (un autre onglet) ; la même relecture, que rien n'a bougé.
 */
export const progressKey = (session: Pick<RunSession, 'status' | 'playedTracks' | 'themeChoice'>): string =>
  [session.status, session.playedTracks.length, session.themeChoice?.round ?? ''].join('|');
