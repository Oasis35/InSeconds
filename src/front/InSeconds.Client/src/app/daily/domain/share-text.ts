/** Ce que le texte de partage montre d'un morceau. */
export interface ShareTrack {
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly listenedSeconds: number;
}

/** `✅/❌ 1s` par morceau (`✅` trouvé, `❌` raté : lisible sans voir les couleurs). */
export function shareLines(tracks: readonly ShareTrack[]): string[] {
  return tracks.map(t => `${t.artistCorrect ? '✅' : '❌'}/${t.titleCorrect ? '✅' : '❌'} ${t.listenedSeconds}s`);
}

/** `jj/mm`, dans le fuseau du joueur. */
export function dayLabel(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
