/** Ce que le texte de partage montre d'un morceau : l'artiste et le titre trouvés ou non, et le palier écouté. */
export interface ShareTrack {
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly listenedSeconds: number;
}

/**
 * Les deux formats du texte partagé : `long`, une ligne par morceau avec l'artiste, le titre et le temps
 * d'écoute (le bouton principal, par défaut), et `short`, une ligne d'un emoji par morceau (choisi par la flèche ▾). Dans l'ordre du menu. Les mêmes valeurs que la route `POST /api/daily/shares`.
 */
export type ShareFormat = 'short' | 'long';

/** Les formats, dans l'ordre du menu ▾. */
export const SHARE_FORMATS: readonly ShareFormat[] = ['long', 'short'];

export function isShareFormat(value: string): value is ShareFormat {
  return (SHARE_FORMATS as readonly string[]).includes(value);
}

/** Met une durée au format d'une langue (`formatSeconds` de `ui/format`, que la couche `domain` ne voit pas). */
export type FormatDuration = (seconds: number, lang: string) => string;

/** Par nombre de réponses trouvées sur le morceau (0, 1 ou 2) : trois formes différentes, pas seulement des couleurs (daltoniens). */
const GRID_EMOJIS = ['🅾️', '🔶', '✅'] as const;

/**
 * Le format court : un emoji par morceau, sur une ligne, `✅` artiste et titre trouvés, `🔶` l'un des deux seulement, `🅾️` rien.
 */
export function shareGrid(tracks: readonly ShareTrack[]): string {
  return tracks.map(t => GRID_EMOJIS[Number(t.artistCorrect) + Number(t.titleCorrect)]).join('');
}

/** `✅` trouvé, `❌` raté : deux formes différentes, pas seulement deux couleurs, la ligne reste lisible pour un daltonien. */
function mark(correct: boolean): string {
  return correct ? '✅' : '❌';
}

/** La ligne d'un morceau du format détaillé : l'emoji de l'artiste, celui du titre, puis le palier écouté (« ✅❌ 0,5 s »). */
export function shareLine(track: ShareTrack, formatDuration: FormatDuration, lang: string): string {
  return `${mark(track.artistCorrect)}${mark(track.titleCorrect)} ${formatDuration(track.listenedSeconds, lang)}`;
}

/**
 * Le format détaillé : une ligne par morceau, dans l'ordre reçu ({@link shareLine}). Les emojis viennent avant le temps pour que la colonne
 * reste alignée.
 */
export function shareLines(tracks: readonly ShareTrack[], formatDuration: FormatDuration, lang: string): string[] {
  return tracks.map(t => shareLine(t, formatDuration, lang));
}

/**
 * Le corps du texte partagé, entre la première ligne (score, nom, date) et le lien : la ligne d'emojis pour le court, une ligne par morceau
 * pour le détaillé. Seule source de ce que contient chaque format : le partage et l'aperçu du menu ▾ la lisent tous les deux.
 */
export function shareBody(tracks: readonly ShareTrack[], format: ShareFormat, formatDuration: FormatDuration, lang: string): string[] {
  return format === 'long' ? shareLines(tracks, formatDuration, lang) : [shareGrid(tracks)];
}

/** L'aperçu d'un format dans le menu ▾ : la ligne d'emojis entière, ou la première ligne du détail suivie de « … » s'il y en a d'autres. */
export function sharePreview(tracks: readonly ShareTrack[], format: ShareFormat, formatDuration: FormatDuration, lang: string): string {
  const body = shareBody(tracks, format, formatDuration, lang);
  return body.length > 1 ? `${body[0]} …` : (body[0] ?? '');
}

/** `jj/mm` d'un jour de jeu (`aaaa-mm-jj`, jour UTC) : la date du défi, pas celle de l'horloge du joueur. */
export function dayLabel(gameDay: string): string {
  const [, month, day] = gameDay.split('-');
  return `${day}/${month}`;
}
