/**
 * Quelle étiquette donner à un indice révélé : l'année, l'artiste masqué, ou « Indice » pour un
 * type que ce front ne connaît pas encore (un nouveau type d'indice du back s'affiche donc sans
 * attendre le front). Renvoie la clé de traduction.
 */
export function hintLabelKey(kind: string): string {
  const normalized = kind.toLowerCase();
  if (normalized.includes('year')) return 'gameplay.hint.kind.year';
  if (normalized.includes('artist')) return 'gameplay.hint.kind.artist';
  return 'gameplay.hint.kind.other';
}
