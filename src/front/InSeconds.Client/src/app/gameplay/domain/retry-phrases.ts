/**
 * Les phrases sous le champ à la seconde tentative : factuelles, impersonnelles (jamais « tu »), jamais de pourcentage, et aucune ne dit
 * si c'est l'artiste ou le titre qui est juste (piège 51). Les textes sont dans `gameplay.retry.phrase.<n>` (de 1 à `RETRY_PHRASE_COUNT`).
 */
export const RETRY_PHRASE_COUNT = 7;

/** Une phrase au hasard, jamais la même que la précédente (`previous`, de 1 à `RETRY_PHRASE_COUNT`, ou `null`). `random` rend un nombre de [0, 1[. */
export function nextRetryPhrase(previous: number | null, random: () => number = Math.random): number {
  const others = Array.from({ length: RETRY_PHRASE_COUNT }, (_, i) => i + 1).filter(n => n !== previous);
  return others[Math.min(Math.floor(random() * others.length), others.length - 1)];
}
