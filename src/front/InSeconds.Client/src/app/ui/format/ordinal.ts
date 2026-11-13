/** « 1er », « 2e » en français ; « 1st », « 2nd », « 3rd », « 4th » en anglais. */
export function formatOrdinal(value: number, lang: 'fr' | 'en'): string {
  if (lang === 'fr') return value === 1 ? '1er' : `${value}e`;
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(value);
  const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th', zero: 'th', many: 'th' }[rule];
  return `${value}${suffix}`;
}
