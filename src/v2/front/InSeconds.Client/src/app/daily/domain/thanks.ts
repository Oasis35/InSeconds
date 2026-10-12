/**
 * Le nombre de parties du message de remerciement : arrondi à la dizaine inférieure (« plus de 2 550 parties »). En dessous de
 * dix, `null` : le message se dit sans chiffre.
 */
export function roundedGamesPlayed(completedGames: number): number | null {
  if (!Number.isFinite(completedGames) || completedGames < 10) return null;
  return Math.floor(completedGames / 10) * 10;
}
