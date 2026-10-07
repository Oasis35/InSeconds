/**
 * La manche d'un morceau, en TypeScript pur (§ 6.3 du plan v2) : écouter, saisir, envoyer, voir la
 * réponse. Chaque transition prend la manche et en rend une autre (la même si elle n'a pas lieu
 * d'être). Rien ici ne connaît le mode de jeu, le son ni le réseau : le store l'enveloppe, le mode
 * lui fournit sa politique d'écoute et d'indices et envoie la réponse.
 *
 * Phases : `ready` (rien n'a démarré) → `loading` → `playing` → `listened` (le palier est joué),
 * puis `submitting` → `revealed`. À côté : `audio-error` (la lecture a échoué), `no-preview` (le
 * morceau n'a pas d'extrait) et `submit-error` (l'envoi a échoué, la saisie est gardée).
 */

/** L'état du lecteur, tel que la manche le voit. Un échec de lecture n'est jamais `idle` (pièges 33 et 44). */
export type AudioStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'finished' | 'error';

export type RoundPhase =
  | 'ready'
  | 'loading'
  | 'playing'
  | 'listened'
  | 'audio-error'
  | 'no-preview'
  | 'submitting'
  | 'submit-error'
  | 'revealed';

/** Les paliers d'écoute que le mode propose. Daily : plusieurs, prolongeables ; Runs : une durée fixe. */
export interface ListenPolicy {
  /** Les paliers, en secondes. */
  readonly steps: readonly number[];
  /** Le joueur peut-il prolonger l'écoute au palier suivant ? */
  readonly extendable: boolean;
}

/** Quand chaque niveau d'indice se débloque : `unlockSeconds[0]` pour le niveau 1, etc. Vient des réglages du back. */
export interface HintPolicy {
  readonly unlockSeconds: readonly number[];
}

/** Un indice révélé par le back : l'année, l'artiste masqué… Le front l'affiche, il n'en invente aucun. */
export interface HintFact {
  readonly kind: string;
  readonly value: string | null;
}

export interface RoundConfig {
  readonly trackId: number;
  /** L'extrait de 30 s ; `null` ou vide si Deezer n'en a pas. */
  readonly previewUrl: string | null;
  readonly listen: ListenPolicy;
  readonly hints: HintPolicy;
  /**
   * Le plus long palier déjà écouté sur ce morceau (reprise d'une partie, piège 35) : les paliers
   * plus courts ne sont plus proposés, le serveur refuserait la réponse.
   */
  readonly listenedFloor?: number | null;
  /** Le niveau d'indice déjà révélé (reprise). */
  readonly hintLevel?: number;
  readonly hintFacts?: readonly HintFact[];
}

/** Ce que le mode envoie au serveur pour répondre. */
export interface RoundSubmission {
  readonly trackId: number;
  /** Le palier annoncé (0 si le joueur passe un morceau sans extrait). */
  readonly listenedSeconds: number;
  /** Le joueur a-t-il prolongé l'écoute ? Reste vrai même après une relecture (piège 40). */
  readonly wasExtended: boolean;
  readonly artist: string | null;
  readonly title: string | null;
}

export interface RoundAnswer {
  readonly artist: string | null;
  readonly title: string | null;
}

/** Ce qui reste à confirmer avant d'envoyer : une réponse vide, ou « Passer ». */
export type PendingConfirm = 'empty' | 'skip';

export interface TrackRound {
  readonly trackId: number;
  readonly previewUrl: string | null;
  /** Les paliers proposés, déjà privés de ceux sous le plancher d'écoute. */
  readonly steps: readonly number[];
  readonly extendable: boolean;
  readonly hintUnlockSeconds: readonly number[];
  readonly phase: RoundPhase;
  /** Le palier en cours (0 tant que le joueur n'a pas commencé à écouter). */
  readonly chosenSeconds: number;
  readonly extended: boolean;
  /** L'écoute automatique n'a lieu qu'une fois par morceau (piège 44). */
  readonly autoStarted: boolean;
  readonly hintLevel: number;
  readonly hints: readonly HintFact[];
  readonly confirm: PendingConfirm | null;
  readonly submission: RoundSubmission | null;
}

/** Phases où la saisie est affichée : le joueur peut répondre dès que le son se charge. */
const ANSWERING: ReadonlySet<RoundPhase> = new Set<RoundPhase>(['loading', 'playing', 'listened']);

export function createRound(config: RoundConfig): TrackRound {
  const floor = config.listenedFloor ?? null;
  const steps = [...new Set(config.listen.steps)]
    .filter(step => step > 0 && (floor === null || step >= floor))
    .sort((a, b) => a - b);
  const hasPreview = !!config.previewUrl && steps.length > 0;
  return {
    trackId: config.trackId,
    previewUrl: hasPreview ? config.previewUrl : null,
    steps,
    extendable: config.listen.extendable,
    hintUnlockSeconds: config.hints.unlockSeconds,
    phase: hasPreview ? 'ready' : 'no-preview',
    chosenSeconds: 0,
    extended: false,
    autoStarted: false,
    hintLevel: config.hintLevel ?? 0,
    hints: config.hintFacts ?? [],
    confirm: null,
    submission: null,
  };
}

// --- lecture ---

export const isAnswering = (round: TrackRound): boolean => ANSWERING.has(round.phase);

/** La saisie est visible : pendant l'écoute, jusqu'à la réponse envoyée (et si l'envoi échoue). */
export const showsInput = (round: TrackRound): boolean =>
  isAnswering(round) || round.phase === 'submitting' || round.phase === 'submit-error';

export const maxStep = (round: TrackRound): number => round.steps.at(-1) ?? 0;

/** Le palier d'après celui en cours, `null` au dernier palier ou si le mode ne permet pas de prolonger. */
export function nextStep(round: TrackRound): number | null {
  if (!round.extendable) return null;
  return round.steps.find(step => step > round.chosenSeconds) ?? null;
}

/**
 * Lance l'écoute automatique au premier palier. Une seule fois par morceau : si le lecteur revenait
 * à l'état de repos en cours de manche, un nouveau lancement ramènerait le joueur au premier palier
 * (piège 44).
 */
export function beginListening(round: TrackRound): TrackRound {
  if (round.phase !== 'ready' || round.autoStarted) return round;
  return { ...round, autoStarted: true, chosenSeconds: round.steps[0], phase: 'loading' };
}

/** « Écouter plus » : passe au palier suivant, pendant le chargement comme pendant ou après l'écoute. */
export function listenMore(round: TrackRound): TrackRound {
  const next = nextStep(round);
  if (next === null || !isAnswering(round)) return round;
  return { ...round, chosenSeconds: next, extended: true, phase: round.phase === 'listened' ? 'playing' : round.phase };
}

/** « Réessayer » après un échec de lecture : repart au palier choisi (au premier si rien n'était choisi). */
export function retryPlayback(round: TrackRound): TrackRound {
  if (round.phase !== 'audio-error') return round;
  return { ...round, phase: 'loading', autoStarted: true, chosenSeconds: round.chosenSeconds || round.steps[0] };
}

/**
 * Suit le lecteur. Un retour à `idle` ne change rien, et une erreur de lecture reste une erreur
 * jusqu'au « Réessayer » du joueur : jamais de boucle silencieuse (piège 33).
 */
/** La phase de la manche pour chaque état du lecteur ; `idle` ne change rien. */
const PHASE_OF_AUDIO: Readonly<Record<AudioStatus, RoundPhase | null>> = {
  idle: null,
  loading: 'loading',
  ready: 'loading',
  playing: 'playing',
  finished: 'listened',
  error: 'audio-error',
};

export function onAudio(round: TrackRound, audio: AudioStatus): TrackRound {
  if (!isAnswering(round)) return round;
  const phase = PHASE_OF_AUDIO[audio];
  return phase === null || phase === round.phase ? round : { ...round, phase };
}

// --- indices ---

/** Le plus haut niveau d'indice débloqué par le palier choisi (0 s'il n'y en a aucun). */
export function unlockedHintLevel(round: TrackRound): number {
  return round.hintUnlockSeconds.filter(seconds => round.chosenSeconds >= seconds).length;
}

/** Le niveau qu'on peut demander : le suivant, une fois débloqué (le 1, puis seulement le 2). */
export function availableHintLevels(round: TrackRound): number[] {
  if (!isAnswering(round)) return [];
  const next = round.hintLevel + 1;
  return next <= unlockedHintLevel(round) ? [next] : [];
}

/** Le back a révélé jusqu'à ce niveau, avec ces indices (cumulés). Le niveau ne redescend jamais. */
export function applyHints(round: TrackRound, level: number, facts: readonly HintFact[]): TrackRound {
  if (level <= round.hintLevel) return round;
  return { ...round, hintLevel: level, hints: facts };
}

// --- réponse ---

/** Le joueur valide. Une réponse vide demande d'abord confirmation. */
export function submitAnswer(round: TrackRound, answer: RoundAnswer): TrackRound {
  if (!isAnswering(round)) return round;
  if (!answer.artist && !answer.title) return { ...round, confirm: 'empty' };
  return beginSubmission(round, answer);
}

/** « Passer (0 pts) » : demande confirmation avant d'envoyer une réponse vide. */
export function askSkip(round: TrackRound): TrackRound {
  return isAnswering(round) ? { ...round, confirm: 'skip' } : round;
}

export function cancelConfirm(round: TrackRound): TrackRound {
  return round.confirm === null ? round : { ...round, confirm: null };
}

/** Le joueur confirme : « Passer » envoie une réponse vide, « réponse vide » envoie la saisie telle quelle. */
export function confirmPending(round: TrackRound, answer: RoundAnswer): TrackRound {
  if (round.confirm === null || !isAnswering(round)) return round;
  return beginSubmission(round, round.confirm === 'skip' ? { artist: null, title: null } : answer);
}

/**
 * Passer un morceau dont la lecture est impossible (pas d'extrait, ou échec de lecture) : sans
 * confirmation, la réponse vide part avec le palier déjà écouté (le serveur refuserait moins).
 */
export function skipUnplayable(round: TrackRound): TrackRound {
  if (round.phase !== 'no-preview' && round.phase !== 'audio-error') return round;
  return beginSubmission(round, { artist: null, title: null });
}

/** L'envoi a échoué : la saisie est gardée, le joueur peut réessayer. */
export function submissionFailed(round: TrackRound): TrackRound {
  return round.phase === 'submitting' ? { ...round, phase: 'submit-error' } : round;
}

/** « Réessayer » : la même réponse repart. */
export function retrySubmission(round: TrackRound): TrackRound {
  return round.phase === 'submit-error' && round.submission !== null ? { ...round, phase: 'submitting' } : round;
}

/** Le serveur a répondu : la réponse est révélée. */
export function reveal(round: TrackRound): TrackRound {
  return round.phase === 'submitting' ? { ...round, phase: 'revealed', confirm: null } : round;
}

function beginSubmission(round: TrackRound, answer: RoundAnswer): TrackRound {
  return {
    ...round,
    phase: 'submitting',
    confirm: null,
    submission: {
      trackId: round.trackId,
      listenedSeconds: round.chosenSeconds,
      wasExtended: round.extended,
      artist: answer.artist,
      title: answer.title,
    },
  };
}
