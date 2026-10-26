/** Ce que le texte de partage montre d'un morceau. */
export interface ShareTrack {
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
}

/**
 * Une ligne d'un emoji par morceau : `✅` artiste et titre trouvés, `🔶` l'un des deux seulement, `🅾️` rien. Les trois ont des formes
 * différentes, pas seulement des couleurs : la ligne reste lisible pour un daltonien.
 */
export function shareLine(tracks: readonly ShareTrack[]): string {
  return tracks.map(t => (t.artistCorrect && t.titleCorrect ? '✅' : t.artistCorrect || t.titleCorrect ? '🔶' : '🅾️')).join('');
}

/** `jj/mm`, dans le fuseau du joueur. */
export function dayLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
