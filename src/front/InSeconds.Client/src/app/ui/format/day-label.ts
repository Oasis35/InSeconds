/** Le jour d'une date `aaaa-mm-jj` tel qu'on le lit dans une liste : sa place par rapport à aujourd'hui, et « mardi 10 ». */
export interface DayLabel {
  /** `today`, `yesterday`, ou rien pour un jour plus ancien (ou à venir). */
  readonly relative: 'today' | 'yesterday' | null;
  /** Le jour de la semaine et le quantième, capitale en tête : « Mardi 10 ». */
  readonly text: string;
}

const DAY_MS = 86_400_000;

function utc(dateText: string): number {
  const [y, m, d] = dateText.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function locale(lang: string): string {
  return lang === 'en' ? 'en-GB' : 'fr-FR';
}

function relativeDay(days: number): DayLabel['relative'] {
  if (days === 0) return 'today';
  return days === 1 ? 'yesterday' : null;
}

/** Le jour d'un défi (jour UTC, comme le jeu) lu depuis `todayText`. */
export function dayLabel(dateText: string, todayText: string, lang: string): DayLabel {
  const days = Math.round((utc(todayText) - utc(dateText)) / DAY_MS);
  const text = new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(utc(dateText)));
  return { relative: relativeDay(days), text: capitalized(text) };
}

/** Un mois `aaaa-mm` en toutes lettres : « Novembre 2026 ». */
export function monthLabel(monthText: string, lang: string): string {
  const [y, m] = monthText.split('-').map(Number);
  return capitalized(new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))));
}

/** Le jour UTC d'un instant, `aaaa-mm-jj` : le jour du jeu. */
export function utcDayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const MONTH_TEXT = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Un mois bien écrit (`aaaa-mm`) ? Sinon la page lit le mois en cours. */
export function isMonthText(value: string | null | undefined): value is string {
  return !!value && MONTH_TEXT.test(value);
}

/** Un score écrit dans la langue : « 2 140 » en français, « 2,140 » en anglais ; « · » sans score. */
export function formatScore(score: number | null, lang: string): string {
  return score === null ? '·' : new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(score);
}
