/**
 * Une durée dans le format de la langue, unité comprise : « 0,5 s », « 10 s » en français, « 0.5 s »
 * en anglais. Espace insécable avant l'unité (jamais de retour à la ligne entre le nombre et le « s »).
 * `fractionDigits` fixe le nombre de décimales (le chrono : « 6,0 s ») ; sans lui, une décimale au plus.
 */
export function formatSeconds(value: number, lang: string, fractionDigits?: number): string {
  const digits = fractionDigits === undefined
    ? { maximumFractionDigits: 1 }
    : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
  return `${new Intl.NumberFormat(lang, digits).format(value)} s`;
}
