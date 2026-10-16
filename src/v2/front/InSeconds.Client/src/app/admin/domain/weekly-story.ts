// Stories Instagram hebdo : mise en forme pure. Le texte écrit DANS les images est toujours en français
// (public Instagram), indépendant de la langue de l'admin. Les jours sont des textes `aaaa-mm-jj`.

export type StoryKind = 'found' | 'missed';
export type TitleMode = 'thisWeek' | 'lastWeek' | 'custom';

export const TITLE_MODES: readonly TitleMode[] = ['thisWeek', 'lastWeek', 'custom'];
export const CUSTOM_TITLE_MAX_LENGTH = 50;
/** Au-delà de ce nombre de caractères, le titre passe en police réduite pour tenir sur la story. */
export const LONG_TITLE_LENGTH = 36;
/** Le récap couvre par défaut les 7 derniers jours, aujourd'hui compris. */
export const DEFAULT_PERIOD_DAYS = 7;

/** Un morceau retenu par le récap : le plus trouvé ou le plus raté de la période. */
export interface WeeklyTrack {
  readonly artist: string;
  readonly title: string;
  readonly successRatePercent: number;
  readonly answers: number;
}

export interface WeeklyRecap {
  /** `ok` : de quoi faire des stories ; `insufficient` : pas assez de réponses sur la période. */
  readonly status: 'ok' | 'insufficient';
  readonly from: string;
  readonly to: string;
  readonly minAnswers: number;
  readonly mostFound: WeeklyTrack | null;
  readonly mostMissed: WeeklyTrack | null;
}

export interface StoryImage {
  readonly kind: StoryKind;
  readonly dataUrl: string;
  readonly fileName: string;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const PRESET_TITLES: Record<Exclude<TitleMode, 'custom'>, string> = {
  thisWeek: 'Cette semaine dans InSeconds 🎧',
  lastWeek: 'La semaine dernière dans InSeconds 🎧',
};

/** « 21 → 27 sept. », ou « 29 sept. → 5 oct. » à cheval sur deux mois. */
export function formatPeriod(from: string, to: string): string {
  const [, fromMonth, fromDay] = from.split('-').map(Number);
  const [, toMonth, toDay] = to.split('-').map(Number);
  return fromMonth === toMonth
    ? `${fromDay} → ${toDay} ${MONTHS[toMonth - 1]}`
    : `${fromDay} ${MONTHS[fromMonth - 1]} → ${toDay} ${MONTHS[toMonth - 1]}`;
}

/** « 87 % » (arrondi à l'entier). */
export function formatPercent(value: number): string {
  return `${Math.round(value)} %`;
}

/** Classe de taille selon la longueur, pour qu'un nom long tienne sans déborder. */
export function sizeClass(text: string): 'len-m' | 'len-l' | '' {
  if (text.length > 32) return 'len-l';
  if (text.length > 22) return 'len-m';
  return '';
}

/** « instagram-trouve-2026-09-27.png » */
export function storyFileName(kind: StoryKind, to: string): string {
  return `instagram-${kind === 'found' ? 'trouve' : 'rate'}-${to}.png`;
}

/** Le titre écrit en haut des images : un des deux textes prédéfinis, ou le texte libre (rogné, vide possible). */
export function storyTitle(mode: TitleMode, customTitle: string): string {
  return mode === 'custom' ? customTitle.trim() : PRESET_TITLES[mode];
}

export function clampCustomTitle(text: string): string {
  return text.slice(0, CUSTOM_TITLE_MAX_LENGTH);
}

/** `aaaa-mm-jj` (UTC), `daysAgo` jours avant `now`. */
export function utcDay(now: Date, daysAgo = 0): string {
  const day = new Date(now);
  day.setUTCDate(day.getUTCDate() - daysAgo);
  return day.toISOString().slice(0, 10);
}

/** Les 7 derniers jours, aujourd'hui compris. */
export function defaultPeriod(now: Date): { from: string; to: string } {
  return { from: utcDay(now, DEFAULT_PERIOD_DAYS - 1), to: utcDay(now) };
}

/** Période exploitable : les deux jours remplis, début avant fin ou égal (le format se compare en texte). */
export function isPeriodValid(from: string, to: string): boolean {
  return from !== '' && to !== '' && from <= to;
}
