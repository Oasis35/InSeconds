/** État de l'extrait d'un morceau, tel que le contrôle de Deezer le connaît (`unknown` : jamais contrôlé). */
export type PreviewState = 'unknown' | 'available' | 'missing';

/** Ce qu'un mode de jeu dit d'un morceau : présent dans `usages` = le mode l'a joué. Les dates sont des jours ISO `yyyy-MM-dd`. */
export interface ModeUsage {
  readonly mode: string;
  readonly usageCount: number;
  readonly lastUsedDate: string | null;
  readonly unlockDate: string | null;
  readonly inTodayChallenge: boolean;
  /** Réponses données sur ce morceau dans ce mode. */
  readonly answerCount: number;
  /** Parmi elles, celles qui ont trouvé l'artiste ou le titre. */
  readonly foundCount: number;
}

/**
 * Un morceau du pool tel que l'admin le voit. Le pool est commun à tous les modes : `isUsed` vient du back (un mode
 * au moins l'a joué), et `usages` donne ce que chaque mode en a fait (le Daily : dernier jour, apparitions, déblocage,
 * défi du jour).
 */
export interface PoolTrack {
  readonly id: number;
  readonly deezerTrackId: number;
  readonly artist: string;
  readonly title: string;
  /** L'année de sortie lue chez Deezer, `null` tant qu'elle n'est pas connue. */
  readonly releaseYear: number | null;
  readonly preview: PreviewState;
  readonly isDisabled: boolean;
  readonly isUsed: boolean;
  readonly usages: readonly ModeUsage[];
  /** Les genres de l'album du morceau (noms, par ordre alphabétique) : vides tant qu'ils ne sont pas lus chez Deezer. */
  readonly genres: readonly string[];
  /** Autres titres acceptés comme bonne réponse (saisis par l'admin), jamais montrés aux joueurs : vide, aucun. */
  readonly altTitles: readonly string[];
  /** Les thèmes du morceau (identifiants de la liste de l'admin) : vide tant qu'il n'est classé nulle part. */
  readonly themeIds: readonly number[];
  /** Dans le défi du jour d'un mode : peut être renommé (avec un avertissement) mais pas désactivé. */
  readonly inTodayChallenge: boolean;
}

/** Un thème de la liste de l'admin : un morceau peut en avoir plusieurs, une manche de Setlist en tire ses morceaux. */
export interface PoolTheme {
  readonly id: number;
  readonly name: string;
  /** Combien de morceaux l'ont : un thème sans morceau seulement se supprime. */
  readonly trackCount: number;
  /** Le nom Lucide de son icône (stock de `ui/theme-icon`) ; `null` : aucune. */
  readonly icon: string | null;
}

/** Des morceaux à mettre dans un thème. */
export interface ThemeAssignment {
  readonly themeId: number;
  readonly trackIds: readonly number[];
}

export const THEME_MAX_LENGTH = 60;

/** Un morceau que l'un des modes a joué ne se supprime plus : on le retire du tirage (désactivation). */
export function isUsed(track: Pick<PoolTrack, 'isUsed'>): boolean {
  return track.isUsed;
}

/** Ce que ce mode dit du morceau, `null` s'il ne l'a pas joué. */
export function usageOf(track: Pick<PoolTrack, 'usages'>, mode: string): ModeUsage | null {
  return track.usages.find(usage => usage.mode === mode) ?? null;
}

/**
 * La part des réponses qui ont trouvé le morceau (artiste ou titre), en pourcentage arrondi : sur tous les modes dans le pool, sur ce mode
 * dans sa vue. `null` sans réponse.
 */
export function foundRate(track: Pick<PoolTrack, 'usages'>, mode: string | null = null): number | null {
  const usages = mode === null ? track.usages : track.usages.filter(usage => usage.mode === mode);
  const answers = usages.reduce((sum, usage) => sum + usage.answerCount, 0);
  if (answers === 0) return null;
  return Math.round((usages.reduce((sum, usage) => sum + usage.foundCount, 0) / answers) * 100);
}

/** Les réponses sur lesquelles se calcule `foundRate`. */
export function answerCount(track: Pick<PoolTrack, 'usages'>, mode: string | null = null): number {
  return track.usages.filter(usage => mode === null || usage.mode === mode).reduce((sum, usage) => sum + usage.answerCount, 0);
}

/** Ce mode a joué le morceau. */
export function isUsedByMode(track: Pick<PoolTrack, 'usages'>, mode: string): boolean {
  return usageOf(track, mode) !== null;
}

/** « Artiste - Titre », la forme sous laquelle un morceau est nommé dans l'admin. */
export function trackLabel(track: Pick<PoolTrack, 'artist' | 'title'>): string {
  return `${track.artist} - ${track.title}`;
}

/** Un résultat de la recherche Deezer de l'admin : de quoi écouter l'extrait et ajouter le morceau. */
export interface DeezerResult {
  readonly deezerTrackId: number;
  readonly artist: string;
  readonly title: string;
  readonly previewUrl: string | null;
}

/** Longueurs maximales de l'artiste et du titre (celles de l'API). */
export const ARTIST_MAX_LENGTH = 200;
export const TITLE_MAX_LENGTH = 300;
/** Nombre maximal d'autres titres par morceau (validateur de l'API). */
export const ALT_TITLES_MAX = 5;
/** Longueur maximale du genre saisi (validateur de l'API). */
export const GENRE_MAX_LENGTH = 60;

/** Ce que l'admin peut corriger : les deux noms, non vides une fois les espaces retirés. */
export function isValidTrackName(artist: string, title: string): boolean {
  const a = artist.trim();
  const t = title.trim();
  return a.length > 0 && a.length <= ARTIST_MAX_LENGTH && t.length > 0 && t.length <= TITLE_MAX_LENGTH;
}
