import { PoolTrack } from './pool-track';

/**
 * Sous ce seuil, l'admin montre le thème en rouge (« Pas jouable »). Seuil de prudence propre à l'admin, plus haut que la règle du
 * serveur : celui-ci retient un thème dès qu'il a encore, dans la playlist, autant de morceaux libres que le `TracksPerRound` figé dans
 * le défi (3 par défaut, `RunThemes.Eligible`) ; les morceaux déjà tirés dans la playlist réduisent ce nombre en cours de partie, et
 * ceux que le joueur a entendus récemment aussi, tant qu'il reste assez de thèmes sans eux (`RunRoundDealer`).
 */
export const MIN_PLAYABLE_TRACKS = 7;
/** À partir de combien de morceaux jouables un thème est assez varié pour que deux parties ne se ressemblent pas trop. */
export const VARIED_FROM_TRACKS = 14;

/** Rouge : sous le seuil de prudence de l'admin ; orange : jouable mais peu varié ; vert : jouable et varié. */
export type ThemeHealth = 'unplayable' | 'thin' | 'varied';

/** Un morceau que le tirage peut prendre : extrait disponible et morceau pas désactivé. */
export function isPlayableTrack(track: Pick<PoolTrack, 'preview' | 'isDisabled'>): boolean {
  return !track.isDisabled && track.preview === 'available';
}

export function themeHealth(playableCount: number): ThemeHealth {
  if (playableCount < MIN_PLAYABLE_TRACKS) return 'unplayable';
  return playableCount < VARIED_FROM_TRACKS ? 'thin' : 'varied';
}

/** Combien de morceaux jouables manquent pour atteindre le seuil de prudence de l'admin (0 s'il l'atteint). */
export function missingTracks(playableCount: number): number {
  return Math.max(0, MIN_PLAYABLE_TRACKS - playableCount);
}

/** Un thème tel que l'onglet le montre : ses morceaux comptés dans le pool, dont ceux que le tirage peut prendre. */
export interface ThemeRow {
  readonly id: number;
  readonly name: string;
  readonly icon: string | null;
  readonly total: number;
  readonly playable: number;
  readonly health: ThemeHealth;
}

export type ThemeFilter = 'all' | ThemeHealth;

/** Les thèmes par nom, chacun avec ses morceaux comptés d'après le pool. */
export function themeRows(themes: readonly { id: number; name: string; icon?: string | null }[], tracks: readonly PoolTrack[]): ThemeRow[] {
  return themes
    .map(theme => {
      const inTheme = tracks.filter(t => t.themeIds.includes(theme.id));
      const playable = inTheme.filter(isPlayableTrack).length;
      return { id: theme.id, name: theme.name, icon: theme.icon ?? null, total: inTheme.length, playable, health: themeHealth(playable) };
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
