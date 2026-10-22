/** Les réponses d'un jour passé (#407) : ce que tout le monde voit, et ce que le joueur reconnu y a fait. TypeScript pur. */

/** Part des réponses trouvées à ce palier d'écoute (en %). */
export interface ArchiveGuessStep {
  readonly durationSeconds: number;
  readonly percent: number;
}

/** Une colonne de l'égaliseur : part des joueurs (en %) dont le score tombe dans la tranche. */
export interface ArchiveScoreBucket {
  readonly minScore: number;
  readonly maxScore: number;
  readonly percent: number;
}

/** Un morceau d'un jour passé ; ses pourcentages sont vides sous le seuil de joueurs. */
export interface ArchiveTrack {
  readonly position: number;
  readonly artist: string;
  readonly title: string;
  readonly releaseYear: number | null;
  readonly deezerTrackId: number;
  readonly coverUrl: string | null;
  readonly artistFoundPercent: number | null;
  readonly titleFoundPercent: number | null;
  readonly guessSteps: readonly ArchiveGuessStep[];
  readonly notFoundPercent: number | null;
}

/** Un jour publié (`GET /api/daily/archive/{date}`). Que des pourcentages : jamais un nombre de joueurs. */
export interface ArchiveDay {
  /** `aaaa-mm-jj`. */
  readonly date: string;
  readonly previousDate: string | null;
  readonly nextDate: string | null;
  /** Assez de joueurs ce jour-là pour montrer des statistiques (le seuil est appliqué par le serveur). */
  readonly hasStats: boolean;
  readonly medianScore: number | null;
  readonly minScore: number | null;
  readonly maxScore: number | null;
  readonly maxPossibleScore: number;
  readonly scoreDistribution: readonly ArchiveScoreBucket[];
  readonly tracks: readonly ArchiveTrack[];
}

export interface ArchiveMyAnswer {
  readonly position: number;
  readonly artistCorrect: boolean;
  readonly titleCorrect: boolean;
  readonly listenedSeconds: number;
  readonly score: number;
}

/** Ce que le joueur reconnu a fait ce jour-là (`GET /api/daily/archive/{date}/me`) ; `played` à faux : rien d'autre. */
export interface ArchiveMe {
  readonly played: boolean;
  readonly score: number | null;
  readonly betterThanPercent: number | null;
  readonly answers: readonly ArchiveMyAnswer[];
}

export const NOBODY: ArchiveMe = { played: false, score: null, betterThanPercent: null, answers: [] };

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/** Une date `aaaa-mm-jj` qui existe (le 31 février n'en est pas une). */
export function isDateText(value: string | null | undefined): value is string {
  if (!value || !DATE_TEXT.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** La position du morceau le plus raté (le plus de « rien trouvé », le premier en cas d'égalité) ; vide sans statistiques ou si personne n'a raté. */
export function mostMissedPosition(day: ArchiveDay): number | null {
  if (!day.hasStats) return null;
  let best: ArchiveTrack | null = null;
  for (const track of day.tracks) {
    if ((track.notFoundPercent ?? 0) > (best?.notFoundPercent ?? 0)) best = track;
  }
  return best?.position ?? null;
}

/** Les artistes du jour pour le titre de la page : les trois premiers, différents, suivis de « … » s'il y en a d'autres. */
export function artistsSummary(day: ArchiveDay, max = 3): string {
  const artists = [...new Set(day.tracks.map(t => t.artist))];
  return artists.slice(0, max).join(', ') + (artists.length > max ? '…' : '');
}

/** Ce que le joueur a fait sur un morceau, par position. */
export function answerAt(me: ArchiveMe, position: number): ArchiveMyAnswer | null {
  return me.answers.find(a => a.position === position) ?? null;
}

/** Une case du calendrier : un jour du mois, publié ou non. */
export interface CalendarCell {
  readonly date: string;
  readonly day: number;
  readonly published: boolean;
}

/**
 * Les semaines d'un mois (lundi en premier), pour le calendrier : `null` pour les cases hors du mois.
 * `month` va de 1 à 12.
 */
export function monthGrid(year: number, month: number, published: ReadonlySet<string>): readonly (CalendarCell | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells: (CalendarCell | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day, published: published.has(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Une date du jeu dans la langue : « 21 octobre 2026 », ou avec le jour et sans l'année : « mardi 21 octobre ». */
export function formatGameDate(dateText: string, lang: 'fr' | 'en', style: 'long' | 'weekday' = 'long'): string {
  const [y, m, d] = dateText.split('-').map(Number);
  const options: Intl.DateTimeFormatOptions = style === 'weekday'
    ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
    : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', options).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Le mois d'une date (« octobre 2026 »), pour l'en-tête du calendrier. */
export function formatMonth(year: number, month: number, lang: 'fr' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}
