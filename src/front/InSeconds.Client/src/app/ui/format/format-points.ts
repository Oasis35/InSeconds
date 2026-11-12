/** Des points dans le format de la langue : « 1 840 » en français (espace fine insécable, jamais de coupure dans le nombre), « 1,840 » en anglais. */
export function formatPoints(value: number, lang: string): string {
  return new Intl.NumberFormat(lang).format(value);
}
