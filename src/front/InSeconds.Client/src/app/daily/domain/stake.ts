import { DailySettings } from './daily';

/**
 * Les points en jeu du défi du jour : ce que rapporterait le morceau trouvé en entier au palier `seconds` (`Daily:DurationScores`),
 * moins la pénalité du niveau d'indice `hintLevel` déjà pris (`Daily:HintPenaltyPercent`), arrondis comme le serveur
 * (`DurationScoringPolicy` : au pair le plus proche). Un palier sans barème vaut 0.
 */
export function dailyStake(settings: Pick<DailySettings, 'durationScores' | 'hints'>, seconds: number, hintLevel: number): number {
  // Le dernier barème du palier s'il est en double, comme le serveur.
  const base = settings.durationScores.reduce((score, d) => (d.seconds === seconds ? d.score : score), 0);
  const penalty = hintLevel > 0 ? (settings.hints.find(h => h.level === hintLevel)?.penaltyPercent ?? 0) : 0;
  return penalty > 0 ? roundHalfEven(base * (1 - penalty / 100)) : base;
}

/** L'arrondi de `Math.Round` côté serveur : une moitié va au pair le plus proche. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  if (Math.abs(value - floor - 0.5) > 1e-9) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
