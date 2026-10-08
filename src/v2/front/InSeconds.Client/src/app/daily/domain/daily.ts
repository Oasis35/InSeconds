import { Streak } from './streak';

/** Ce que le serveur dit de la partie du jour pour ce navigateur (`GET /api/daily/today`). */
export type TodayState = 'no_challenge' | 'can_start' | 'resumable' | 'already_played' | 'abandoned';

export interface DailyToday {
  readonly state: TodayState;
  /** Morceaux du défi (0 sans défi). */
  readonly tracksCount: number;
  /** Morceaux déjà répondus, quand la partie est à reprendre. */
  readonly completedCount: number;
  readonly streak: Streak;
}

/** Un niveau d'indice : quand il se débloque, ce qu'il révèle (`year`, `artistMasked`) et son coût en pourcentage du score. */
export interface HintLevelSetting {
  readonly level: number;
  readonly unlockSeconds: number;
  readonly kind: string;
  readonly penaltyPercent: number;
}

/** Les réglages publics du défi du jour : paliers d'écoute, barème, indices. */
export interface DailySettings {
  readonly guessTimerSeconds: number;
  readonly tracksPerChallenge: number;
  readonly allowedDurationsSeconds: readonly number[];
  readonly hints: readonly HintLevelSetting[];
}

/** Un morceau à jouer : sa position, et son extrait (vide si Deezer n'en a pas). Ni nom ni pochette avant la réponse (piège 31). */
export interface TrackSlot {
  readonly position: number;
  readonly previewUrl: string;
}

/** Combien de joueurs ont trouvé le morceau en écoutant ce palier. */
export interface GuessBucket {
  readonly durationSeconds: number;
  readonly count: number;
}

/**
 * Un morceau répondu, tel que le serveur le révèle : la réponse du joueur, les points, la bonne réponse et, juste après l'envoi,
 * ce qu'en ont fait les autres (absent pour une réponse relue à la reprise).
 */
export interface AnsweredTrack {
  readonly position: number;
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly score: number;
  readonly listenedSeconds: number;
  readonly hintLevel: number;
  readonly correctArtist: string;
  readonly correctTitle: string;
  readonly deezerTrackId: number;
  /** La pochette n'arrive qu'avec la réponse (piège 31, piège 47 : jamais gardée hors de la mémoire de la page). */
  readonly coverUrl: string | null;
  readonly averageSecondsWhenCorrect: number | null;
  readonly failureRatePercent: number | null;
  readonly distribution: readonly GuessBucket[];
  readonly notFoundCount: number;
}

/** Ce que la partie a déjà vu du morceau en cours (reprise) : le plancher d'écoute et les indices déjà payés. */
export interface ResumedTrack {
  readonly position: number;
  readonly listenedSeconds: number;
  readonly hintLevel: number;
  readonly hintFacts: readonly { readonly kind: string; readonly value: string | null }[];
}

export interface StartedSession {
  readonly sessionId: number;
  readonly tracks: readonly TrackSlot[];
  readonly streak: Streak;
  readonly isResuming: boolean;
  /** Le morceau à jouer maintenant : le premier sans réponse. */
  readonly nextPosition: number;
  readonly completedAnswers: readonly AnsweredTrack[];
  readonly currentTrack: ResumedTrack | null;
}

/** La réponse du joueur au serveur : un `RoundSubmission` de la manche, sans l'identifiant de morceau (c'est la position). */
export interface AnswerToSend {
  readonly position: number;
  readonly listenedSeconds: number;
  readonly wasExtended: boolean;
  readonly artist: string | null;
  readonly title: string | null;
}

/** Les chiffres d'un morceau pour la liste de résultats (récap, « déjà joué »). */
export interface TrackStat {
  readonly position: number;
  readonly artist: string;
  readonly title: string;
  readonly deezerTrackId: number;
  readonly coverUrl: string | null;
  readonly failureRatePercent: number;
  readonly averageSecondsWhenCorrect: number | null;
  /** Ce que le joueur en a fait ; vide s'il n'a pas de partie terminée. */
  readonly artistCorrect: boolean | null;
  readonly titleCorrect: boolean | null;
  readonly listenedSeconds: number | null;
  readonly score: number | null;
  readonly distribution: readonly GuessBucket[];
  readonly notFoundCount: number;
}

/** Une tranche de l'égaliseur des scores du jour. */
export interface ScoreBucket {
  readonly minScore: number;
  readonly maxScore: number;
  readonly count: number;
}

/** Les statistiques du jour (`GET /api/daily/stats/today`). `tracks` est vide tant que la partie du joueur n'est pas finie (piège 31). */
export interface DayStats {
  readonly yourScore: number | null;
  readonly medianScore: number;
  readonly totalPlayers: number;
  readonly currentStreak: number;
  readonly tracks: readonly TrackStat[];
  readonly freezesUsed: number;
  readonly freezeMilestone: boolean;
  readonly minScore: number | null;
  readonly maxScore: number | null;
  readonly maxPossibleScore: number;
  readonly scoreDistribution: readonly ScoreBucket[];
  readonly betterThanPercent: number | null;
}

/** Ce que le démarrage d'une partie peut donner (jamais une erreur : les refus du jeu sont des issues). */
export type StartOutcome =
  | { readonly kind: 'ok'; readonly session: StartedSession }
  | { readonly kind: 'already_played'; readonly abandoned: boolean }
  | { readonly kind: 'no_challenge' }
  | { readonly kind: 'error' };
