/** Combien de joueurs ont trouvé le morceau en écoutant ce palier. */
export interface GuessBucket {
  readonly durationSeconds: number;
  readonly count: number;
}

/**
 * Ce que le serveur révèle une fois la réponse envoyée, vu par la manche. Les points sont ceux du
 * mode (le barème d'un mode n'est pas celui d'un autre) : le mode les affiche à côté.
 */
export interface RoundResult {
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly correctArtist: string;
  readonly correctTitle: string;
  readonly coverUrl: string | null;
  /** Le palier annoncé, pour surligner la colonne du joueur dans le graphique. */
  readonly listenedSeconds: number;
  /** Les autres joueurs : un compte par palier, dans l'ordre croissant des durées. */
  readonly distribution: readonly GuessBucket[];
  /** Nombre de joueurs qui n'ont pas trouvé. */
  readonly notFoundCount: number;
}

/** Le joueur a-t-il trouvé quelque chose (l'artiste ou le titre) ? Surligne sa barre, ou la barre « ✗ ». */
export const foundSomething = (result: RoundResult): boolean => result.artistCorrect || result.titleCorrect;
