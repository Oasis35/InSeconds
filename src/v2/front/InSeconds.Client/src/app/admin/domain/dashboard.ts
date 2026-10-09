/** Une journée de jeu, au format `aaaa-mm-jj` : un jour UTC, sans fuseau. */
export type Day = string;

export interface DayActivity {
  day: Day;
  playerCount: number;
}

export interface PlayerBreakdown {
  totalGuests: number;
  totalRegistered: number;
  activeLast7Days: number;
  activeLast30Days: number;
}

/** Les chiffres d'un jour qui a un défi. */
export interface DayKpis {
  day: Day;
  completedCount: number;
  abandonedCount: number;
  expiredCount: number;
  pendingCount: number;
  totalSessions: number;
  /** En pourcentage, de 0 à 100. */
  completionRate: number;
  medianScore: number | null;
}

export interface Dashboard {
  /** Activité des 30 derniers jours, du plus ancien au plus récent. */
  activity: readonly DayActivity[];
  players: PlayerBreakdown;
  /** Les jours qui ont un défi, du plus récent au plus ancien. */
  availableDays: readonly Day[];
  /** `null` si le jour demandé n'a pas de défi. */
  kpis: DayKpis | null;
}

const ACTIVITY_BAR_MAX_PX = 64;
const ACTIVITY_BAR_MIN_PX = 4;
const ACTIVITY_BAR_EMPTY_PX = 2;

/** Aujourd'hui, en jour UTC de jeu. */
export function todayUtc(now: Date): Day {
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

function indexOfDay(availableDays: readonly Day[], selected: Day | null): number {
  return selected === null ? -1 : availableDays.indexOf(selected);
}

/**
 * Le jour voisin dans la liste des jours disponibles (du plus récent au plus ancien) : `delta` > 0
 * va vers le futur, < 0 vers le passé. Un jour sélectionné absent de la liste (aujourd'hui sans
 * défi) repart du plus récent. `null` au bout de la liste.
 */
export function shiftDay(availableDays: readonly Day[], selected: Day | null, delta: number): Day | null {
  if (availableDays.length === 0) return null;
  const index = indexOfDay(availableDays, selected);
  const next = index === -1 ? 0 : index - delta;
  return next >= 0 && next < availableDays.length ? availableDays[next] : null;
}

export function canGoToPreviousDay(availableDays: readonly Day[], selected: Day | null): boolean {
  if (availableDays.length === 0) return false;
  return indexOfDay(availableDays, selected) < availableDays.length - 1;
}

export function canGoToNextDay(availableDays: readonly Day[], selected: Day | null): boolean {
  if (availableDays.length === 0) return false;
  return indexOfDay(availableDays, selected) > 0;
}

/** Un jour en toutes lettres (« lundi 5 octobre »), sans passer par le fuseau du navigateur. */
export function formatDayLong(day: Day, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`));
}

/** Un jour en abrégé (« 5 oct. »). */
export function formatDayShort(day: Day, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${day}T12:00:00Z`));
}
