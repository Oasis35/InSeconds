/**
 * Les motifs du texte partagé du jeu du jour (« Partager mon score »), en français :
 *
 *   2 410 pts · InSeconds 05/11
 *   ✅❌ 3 s                     (une ligne par morceau)
 *   https://…/?utm_source=share
 */

/** Première ligne : le score (milliers séparés par une espace fine insécable), le nom et la date. */
export const SHARE_HEADER_LINE = /^[\d\s]+ pts · InSeconds \d{2}\/\d{2}$/;

/** Une ligne de morceau : `✅`/`❌` de l'artiste, puis du titre, puis le palier écouté (espace insécable avant « s »). */
export const SHARE_TRACK_LINE = /^[✅❌]{2} \d+(,\d)?\ss$/u;

/** Dernière ligne : le lien, marqué `utm_source=share`. */
const SHARE_LINK_LINE = /^https?:\/\/[^/]+\/\?utm_source=share$/;

/** Ce qui ne va pas dans un texte partagé pour une partie de `trackCount` morceaux ; vide s'il est conforme. */
export function shareTextProblems(text: string, trackCount: number): string[] {
  const lines = text.split('\n');
  const problems: string[] = [];
  if (lines.length !== trackCount + 2) problems.push(`${lines.length} lignes au lieu de ${trackCount + 2}`);
  if (!SHARE_HEADER_LINE.test(lines[0] ?? '')) problems.push(`en-tête : « ${lines[0]} »`);
  lines.slice(1, -1).forEach((line, i) => {
    if (!SHARE_TRACK_LINE.test(line)) problems.push(`morceau ${i + 1} : « ${line} »`);
  });
  if (!SHARE_LINK_LINE.test(lines.at(-1) ?? '')) problems.push(`lien : « ${lines.at(-1)} »`);
  if (/[🎵🏆]/u.test(text)) problems.push('emoji décoratif');
  return problems;
}
