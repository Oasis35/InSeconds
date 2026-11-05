/**
 * Les motifs du texte partagé du jeu du jour (« Partager mon score »), en français. Les deux formats commencent par la même ligne et
 * finissent par le lien :
 *
 *   court                          détaillé
 *   2 410 pts · InSeconds 05/11    2 410 pts · InSeconds 05/11
 *   ✅🔶🅾️✅✅                      ✅❌ 3 s            (une ligne par morceau)
 *   https://…/?utm_source=share    https://…/?utm_source=share-long
 */

/** Première ligne : le score (milliers séparés par une espace fine insécable), le nom et la date. */
export const SHARE_HEADER_LINE = /^[\d\s ]+ pts · InSeconds \d{2}\/\d{2}$/;

/** Le format court : un emoji par morceau, `✅` (les deux), `🔶` (l'un des deux) ou `🅾️` (rien). */
const SHARE_GRID_LINE = (trackCount: number) => new RegExp(`^(✅|🔶|🅾️){${trackCount}}$`, 'u');

/** Une ligne de morceau du format détaillé : `✅`/`❌` de l'artiste, puis du titre, puis le palier écouté (espace insécable avant « s »). */
export const SHARE_TRACK_LINE = /^[✅❌]{2} \d+(,\d)? s$/u;

/** Dernière ligne : le lien, marqué `utm_source=share` (court) ou `utm_source=share-long` (détaillé). */
const SHARE_LINK_LINE = { short: /^https?:\/\/[^/]+\/\?utm_source=share$/, long: /^https?:\/\/[^/]+\/\?utm_source=share-long$/ };

/** Ce qui ne va pas dans un texte partagé au format donné pour une partie de `trackCount` morceaux ; vide s'il est conforme. */
export function shareTextProblems(text: string, trackCount: number, format: 'short' | 'long' = 'short'): string[] {
  const lines = text.split('\n');
  const body = lines.slice(1, -1);
  const expectedLines = format === 'long' ? trackCount + 2 : 3;
  const problems: string[] = [];
  if (lines.length !== expectedLines) problems.push(`${lines.length} lignes au lieu de ${expectedLines}`);
  if (!SHARE_HEADER_LINE.test(lines[0] ?? '')) problems.push(`en-tête : « ${lines[0]} »`);
  if (format === 'long') {
    body.forEach((line, i) => {
      if (!SHARE_TRACK_LINE.test(line)) problems.push(`morceau ${i + 1} : « ${line} »`);
    });
  } else if (!SHARE_GRID_LINE(trackCount).test(body[0] ?? '')) {
    problems.push(`ligne d'emojis : « ${body[0]} »`);
  }
  if (!SHARE_LINK_LINE[format].test(lines.at(-1) ?? '')) problems.push(`lien : « ${lines.at(-1)} »`);
  if (/🎵|🏆/u.test(text)) problems.push('emoji décoratif');
  return problems;
}
