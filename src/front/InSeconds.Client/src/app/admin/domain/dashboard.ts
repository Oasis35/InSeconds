// Les jours de jeu sont des textes `aaaa-mm-jj` : un jour UTC, sans fuseau.

export interface DayActivity {
  day: string;
  playerCount: number;
}

export interface PlayerBreakdown {
  totalGuests: number;
  totalRegistered: number;
  activeLast7Days: number;
  activeLast30Days: number;
}

/** Les joueurs arrivés par une source : `instagram`, `share`, `direct`, `other`, ou le domaine d'un site (`google.com`). */
export interface ArrivalCount {
  source: string;
  count: number;
}

/** Les chiffres d'un jour qui a un défi. */
export interface DayKpis {
  day: string;
  completedCount: number;
  abandonedCount: number;
  expiredCount: number;
  pendingCount: number;
  totalSessions: number;
  /** En pourcentage, de 0 à 100. */
  completionRate: number;
  medianScore: number | null;
  /** Les joueurs dont c'est la toute première partie du jeu du jour. */
  newPlayersCount: number;
  /** Les comptes ouverts ce jour-là (jour UTC). */
  accountsCreatedCount: number;
  /** Parmi ceux qui ont fini, ceux dont c'est la toute première partie ; les autres sont des habitués. */
  firstTimeFinishersCount: number;
  /** Les joueurs arrivés ce jour-là, par source, la plus fréquente d'abord. */
  arrivals: readonly ArrivalCount[];
}

/** Des partages du score, par format du texte : `short` (✅ / 🔶 / 🅾️) et `long` (une ligne par morceau). */
export interface ShareCounts {
  short: number;
  long: number;
}

/** Les partages du score faits : le jour affiché (même sans défi) et les 30 derniers jours. */
export interface DashboardShares {
  selectedDay: ShareCounts;
  last30Days: ShareCounts;
}

export interface Dashboard {
  /** Activité des 30 derniers jours, du plus ancien au plus récent. */
  activity: readonly DayActivity[];
  players: PlayerBreakdown;
  /** Les jours qui ont un défi, du plus récent au plus ancien. */
  availableDays: readonly string[];
  /** `null` si le jour demandé n'a pas de défi. */
  kpis: DayKpis | null;
  /** Les joueurs arrivés les 30 derniers jours, par source, la plus fréquente d'abord. */
  arrivals: readonly ArrivalCount[];
  shares: DashboardShares;
}

/** Les sources d'arrivée des deux liens du partage du score : `share` (le court, et aussi le lien d'une playlist Platines) et `share-long`. */
export const SHORT_SHARE_SOURCE = 'share';
export const LONG_SHARE_SOURCE = 'share-long';

const KNOWN_SOURCES: ReadonlySet<string> = new Set(['instagram', 'tiktok', SHORT_SHARE_SOURCE, LONG_SHARE_SOURCE, 'direct', 'other']);

/** Les joueurs venus par chaque lien du partage, parmi ces arrivées. */
export function sharedArrivals(arrivals: readonly ArrivalCount[]): ShareCounts {
  const count = (source: string) => arrivals.find(a => a.source === source)?.count ?? 0;
  return { short: count(SHORT_SHARE_SOURCE), long: count(LONG_SHARE_SOURCE) };
}

/** La clé i18n d'une source connue (`admin.sources.instagram`) ; `null` pour un domaine, qui s'affiche tel quel. */
export function sourceLabelKey(source: string): string | null {
  return KNOWN_SOURCES.has(source) ? `admin.sources.${source}` : null;
}

/** Une part de la barre des sources : une source, ou `null` pour le reste réuni (« Autres »). */
export interface ArrivalShare {
  source: string | null;
  count: number;
  /** En pourcentage, arrondi à l'unité. */
  percent: number;
}

/**
 * Les parts de la barre « D'où viennent les nouveaux » : les `top` sources les plus fréquentes, puis le reste réuni (dont `other`) ;
 * vide sans arrivée.
 */
export function arrivalShares(arrivals: readonly ArrivalCount[], top = 3): ArrivalShare[] {
  const total = arrivals.reduce((sum, a) => sum + a.count, 0);
  if (total === 0) return [];
  const named = arrivals.filter(a => a.source !== 'other').slice(0, top);
  const rest = total - named.reduce((sum, a) => sum + a.count, 0);
  const shares: ArrivalShare[] = named.map(a => ({ source: a.source, count: a.count, percent: Math.round((a.count / total) * 100) }));
  if (rest > 0) shares.push({ source: null, count: rest, percent: Math.round((rest / total) * 100) });
  return shares;
}

const ACTIVITY_BAR_MAX_PX = 64;
const ACTIVITY_BAR_MIN_PX = 4;
const ACTIVITY_BAR_EMPTY_PX = 2;

/** Un jour `aaaa-mm-jj` valide (celui de l'adresse `?jour=`), sinon `null`. */
export function parseDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** Aujourd'hui, en jour UTC de jeu. */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function totalPlayers(activity: readonly DayActivity[]): number {
  return activity.reduce((sum, day) => sum + day.playerCount, 0);
}

export function maxDailyPlayers(activity: readonly DayActivity[]): number {
  return Math.max(0, ...activity.map(day => day.playerCount));
}

/** Hauteur d'une barre : proportionnelle au pic, avec un minimum visible et une barre plate pour zéro. */
export function activityBarHeightPx(count: number, max: number): number {
  if (max === 0 || count === 0) return ACTIVITY_BAR_EMPTY_PX;
  return Math.max(ACTIVITY_BAR_MIN_PX, Math.round((count / max) * ACTIVITY_BAR_MAX_PX));
}

/** Couleur du taux de complétion (jeton CSS). */
export function completionRateColor(rate: number): string {
  if (rate >= 70) return 'var(--color-success)';
  if (rate >= 40) return 'var(--color-warn)';
  return 'var(--color-fail)';
}

function indexOfDay(availableDays: readonly string[], selected: string | null): number {
  return selected === null ? -1 : availableDays.indexOf(selected);
}

/**
 * Le jour voisin dans la liste des jours disponibles (du plus récent au plus ancien) : `delta` > 0
 * va vers le futur, < 0 vers le passé. Un jour sélectionné absent de la liste (aujourd'hui sans
 * défi) repart du plus récent. `null` au bout de la liste.
 */
export function shiftDay(availableDays: readonly string[], selected: string | null, delta: number): string | null {
  if (availableDays.length === 0) return null;
  const index = indexOfDay(availableDays, selected);
  const next = index === -1 ? 0 : index - delta;
  return next >= 0 && next < availableDays.length ? availableDays[next] : null;
}

export function canGoToPreviousDay(availableDays: readonly string[], selected: string | null): boolean {
  if (availableDays.length === 0) return false;
  return indexOfDay(availableDays, selected) < availableDays.length - 1;
}

export function canGoToNextDay(availableDays: readonly string[], selected: string | null): boolean {
  if (availableDays.length === 0) return false;
  return indexOfDay(availableDays, selected) > 0;
}

/** Un jour en toutes lettres (« lundi 5 octobre »), sans passer par le fuseau du navigateur. */
export function formatDayLong(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`));
}

/** Un jour en abrégé (« 5 oct. »). */
export function formatDayShort(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`));
}
