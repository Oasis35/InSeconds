import { DailySettings } from './daily';

/**
 * Les points en jeu du défi du jour : ce que rapporterait le morceau trouvé en entier au palier `seconds` (`Daily:DurationScores`),
 * à la seconde tentative multiplié par `Daily:RetryScorePercent`, arrondi comme le serveur
 * (`DurationScoringPolicy` : au pair le plus proche). Un palier sans barème vaut 0.
 */
export function dailyStake(settings: Pick<DailySettings, 'durationScores' | 'retryScorePercent'>, seconds: number, isRetry = false): number {
  // Le dernier barème du palier s'il est en double, comme le serveur.
  const found = settings.durationScores.reduce((score, d) => (d.seconds === seconds ? d.score : score), 0);
  return isRetry ? roundHalfEvenRatio(found, settings.retryScorePercent) : found;
}

/** `score × percent ÷ 100` arrondi comme le serveur, sans flottant : une moitié exacte (reste de 50) va au pair le plus proche. */
function roundHalfEvenRatio(score: number, percent: number): number {
  const whole = Math.floor((score * percent) / 100);
  const remainder = (score * percent) % 100;
  if (remainder === 50) return whole % 2 === 0 ? whole : whole + 1;
  return remainder > 50 ? whole + 1 : whole;
}
