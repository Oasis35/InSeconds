/** Ce que le texte de partage montre d'un morceau : l'artiste et le titre trouvés ou non, et le palier écouté. */
export interface ShareTrack {
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly listenedSeconds: number;
}

/** Met une durée au format d'une langue (`formatSeconds` de `ui/format`, que la couche `domain` ne voit pas). */
export type FormatDuration = (seconds: number, lang: string) => string;

/** `✅` trouvé, `❌` raté : deux formes différentes, pas seulement deux couleurs, la ligne reste lisible pour un daltonien. */
function mark(correct: boolean): string {
  return correct ? '✅' : '❌';
}

/**
 * Une ligne par morceau, dans l'ordre reçu : l'emoji de l'artiste, celui du titre, puis le palier écouté (« ✅❌ 0,5 s »).
 * Les emojis viennent avant le temps pour que la colonne reste alignée.
 */
export function shareLines(tracks: readonly ShareTrack[], formatDuration: FormatDuration, lang: string): string[] {
  return tracks.map(t => `${mark(t.artistCorrect)}${mark(t.titleCorrect)} ${formatDuration(t.listenedSeconds, lang)}`);
}

/** `jj/mm` d'un jour de jeu (`aaaa-mm-jj`, jour UTC) : la date du défi, pas celle de l'horloge du joueur. */
export function dayLabel(gameDay: string): string {
  const [, month, day] = gameDay.split('-');
  return `${day}/${month}`;
}
