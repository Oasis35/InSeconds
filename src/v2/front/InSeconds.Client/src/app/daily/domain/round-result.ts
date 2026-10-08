import { RoundResult } from '../../gameplay/domain/round-result';
import { AnsweredTrack } from './daily';

/** Ce que la carte de révélation de la manche montre d'un morceau répondu (les points sont à côté, ils sont à Daily). */
export function toRoundResult(answer: AnsweredTrack): RoundResult {
  return {
    artistCorrect: answer.artistCorrect,
    titleCorrect: answer.titleCorrect,
    correctArtist: answer.correctArtist,
    correctTitle: answer.correctTitle,
    coverUrl: answer.coverUrl,
    listenedSeconds: answer.listenedSeconds,
    distribution: answer.distribution,
    notFoundCount: answer.notFoundCount,
  };
}
