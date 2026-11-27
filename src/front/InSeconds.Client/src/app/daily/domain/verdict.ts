/** Le mot de la carte du résultat : cinq tranches fixes du score sur le maximum du défi (un cinquième chacune). */
export type ScoreVerdict = 'warmup' | 'correct' | 'veryGood' | 'excellent' | 'almostPerfect';

const VERDICTS: readonly ScoreVerdict[] = ['warmup', 'correct', 'veryGood', 'excellent', 'almostPerfect'];

/** Le maximum d'un défi : tous les morceaux trouvés en entier au premier palier ; `null` sans nombre de morceaux ni barème. */
export function maxDayScore(tracksCount: number | null | undefined, durationScores: readonly { readonly score: number }[] | null | undefined): number | null {
  const top = durationScores?.reduce((max, d) => Math.max(max, d.score), 0) ?? 0;
  return tracksCount && tracksCount > 0 && top > 0 ? tracksCount * top : null;
}

/** Le verdict d'un score ; `null` sans score ni maximum. Un score au maximum (ou au-delà) prend la dernière tranche. */
export function scoreVerdict(score: number | null | undefined, max: number | null): ScoreVerdict | null {
  if (score === null || score === undefined || max === null || max <= 0) return null;
  const index = Math.min(VERDICTS.length - 1, Math.max(0, Math.floor((score / max) * VERDICTS.length)));
  return VERDICTS[index];
}
