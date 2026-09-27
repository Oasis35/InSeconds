// Formatage du texte affiché DANS les images (toujours en français, indépendant de la langue de l'admin).

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 21 → 27 sept. », ou « 29 sept. → 5 oct. » à cheval sur deux mois. Dates au format yyyy-MM-dd. */
export function formatPeriod(from: string, to: string): string {
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  return fm === tm
    ? `${fd} → ${td} ${MONTHS[tm - 1]}`
    : `${fd} ${MONTHS[fm - 1]} → ${td} ${MONTHS[tm - 1]}`;
}

/** « 87 % » (arrondi à l'entier). */
export function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

/** Classe de taille selon la longueur, pour qu'un nom long tienne sans déborder. */
export function sizeClass(text: string): 'len-m' | 'len-l' | '' {
  if (text.length > 32) return 'len-l';
  if (text.length > 22) return 'len-m';
  return '';
}

/** Pochette Deezer en 1000×1000 (le gabarit par défaut sert du 250×250, flou à 400 px). */
export function hiResCover(url: string | null): string | null {
  return url ? url.replace('/250x250-', '/1000x1000-') : null;
}

/** « instagram-trouve-2026-09-27.png » */
export function storyFileName(kind: 'found' | 'missed', to: string): string {
  return `instagram-${kind === 'found' ? 'trouve' : 'rate'}-${to}.png`;
}
