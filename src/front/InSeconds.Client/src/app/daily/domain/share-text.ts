/** Ce que le texte de partage montre d'un morceau. */
export interface ShareTrack {
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
}

/** Un `✅` par morceau trouvé (artiste ou titre), un `❌` par morceau raté, sur une seule ligne. */
export function shareLine(tracks: readonly ShareTrack[]): string {
  return tracks.map(t => (t.artistCorrect || t.titleCorrect ? '✅' : '❌')).join('');
}

/** `jj/mm`, dans le fuseau du joueur. */
export function dayLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
