import { PoolTrack } from './pool-track';

/** Combien de morceaux jouables un thème doit avoir pour qu'une manche de Platines le tire (5 à jouer et 2 de réserve, `Runs:`). */
export const MIN_PLAYABLE_TRACKS = 7;
/** À partir de combien de morceaux jouables un thème est assez varié pour que deux parties ne se ressemblent pas trop. */
export const VARIED_FROM_TRACKS = 14;

/** Rouge : pas proposé en jeu ; orange : jouable mais peu varié ; vert : jouable et varié. */
export type ThemeHealth = 'unplayable' | 'thin' | 'varied';

/** Un morceau que le tirage peut prendre : extrait disponible et morceau pas désactivé. */
export function isPlayableTrack(track: Pick<PoolTrack, 'preview' | 'isDisabled'>): boolean {
  return !track.isDisabled && track.preview === 'available';
}

export function themeHealth(playableCount: number): ThemeHealth {
  if (playableCount < MIN_PLAYABLE_TRACKS) return 'unplayable';
  return playableCount < VARIED_FROM_TRACKS ? 'thin' : 'varied';
}

/** Combien de morceaux jouables manquent pour que le thème soit proposé en jeu (0 s'il l'est). */
export function missingTracks(playableCount: number): number {
  return Math.max(0, MIN_PLAYABLE_TRACKS - playableCount);
}

/** Un thème tel que l'onglet le montre : ses morceaux comptés dans le pool, dont ceux que le tirage peut prendre. */
export interface ThemeRow {
  readonly id: number;
  readonly name: string;
  readonly total: number;
  readonly playable: number;
  readonly health: ThemeHealth;
}

export type ThemeFilter = 'all' | ThemeHealth;

/** Les thèmes par nom, chacun avec ses morceaux comptés d'après le pool. */
export function themeRows(themes: readonly { id: number; name: string }[], tracks: readonly PoolTrack[]): ThemeRow[] {
  return themes
    .map(theme => {
      const inTheme = tracks.filter(t => t.themeIds.includes(theme.id));
      const playable = inTheme.filter(isPlayableTrack).length;
      return { id: theme.id, name: theme.name, total: inTheme.length, playable, health: themeHealth(playable) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Minuscules sans accents : « années » trouve « Annees ». */
export function foldText(text: string): string {
  return text.normalize('NFD').replaceAll(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Les thèmes dont le nom contient le texte (accents et casse ignorés), dans l'état demandé. */
export function filterThemes(rows: readonly ThemeRow[], text: string, filter: ThemeFilter): ThemeRow[] {
  const wanted = foldText(text.trim());
  return rows.filter(r => (filter === 'all' || r.health === filter) && foldText(r.name).includes(wanted));
}

/** Les morceaux dont « artiste titre » contient le texte (accents et casse ignorés). */
export function filterByLabel<T extends Pick<PoolTrack, 'artist' | 'title'>>(tracks: readonly T[], text: string): T[] {
  const wanted = foldText(text.trim());
  return tracks.filter(t => foldText(`${t.artist} ${t.title}`).includes(wanted));
}
