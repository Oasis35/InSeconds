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

/**
 * Le bouton qui demande un niveau : « Indice année », « Indice artiste » quand le back dit ce que le
 * niveau révèle, sinon « Indice 1 », « Indice 2 » (clé `gameplay.hint.button`, avec `level`).
 */
export function hintButtonKey(kind: string | null | undefined): string {
  const label = kind ? hintLabelKey(kind) : null;
  if (label === 'gameplay.hint.kind.year') return 'gameplay.hint.ask.year';
  if (label === 'gameplay.hint.kind.artist') return 'gameplay.hint.ask.artist';
  return 'gameplay.hint.button';
}
