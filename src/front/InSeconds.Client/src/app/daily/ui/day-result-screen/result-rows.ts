import { AnsweredTrack, DayStats } from '../../domain/daily';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';

/**
 * Les lignes d'une partie qui vient de finir : les chiffres du morceau viennent de la réponse quand elle les porte, sinon des stats du jour
 * à la même position (une réponse relue à la reprise n'a ni histogramme ni moyenne).
 */
export function rowsFromResults(results: readonly AnsweredTrack[], stats: DayStats | null): TrackResultRow[] {
  const byPosition = new Map((stats?.tracks ?? []).map(t => [t.position, t]));
  return results.map(r => {
    const own = r.distribution.length > 0;
    const stat = own ? undefined : byPosition.get(r.position);
    return {
      position: r.position,
      artist: r.correctArtist,
      title: r.correctTitle,
      coverUrl: r.coverUrl ?? byPosition.get(r.position)?.coverUrl ?? null,
      artistCorrect: r.artistCorrect,
      titleCorrect: r.titleCorrect,
      listenedSeconds: r.listenedSeconds,
      averageSecondsWhenCorrect: own ? r.averageSecondsWhenCorrect : (stat?.averageSecondsWhenCorrect ?? r.averageSecondsWhenCorrect),
      score: r.score,
      deezerTrackId: r.deezerTrackId,
      distribution: own ? r.distribution : (stat?.distribution ?? []),
      notFoundCount: own ? r.notFoundCount : (stat?.notFoundCount ?? 0),
    };
  });
}

/** Les lignes d'une partie déjà jouée, relues dans les stats du jour (vides tant qu'elles n'ont pas répondu). */
export function rowsFromStats(stats: DayStats | null): TrackResultRow[] {
  return (stats?.tracks ?? []).map(t => ({
    position: t.position,
    artist: t.artist,
    title: t.title,
    coverUrl: t.coverUrl,
    artistCorrect: t.artistCorrect,
    titleCorrect: t.titleCorrect,
    listenedSeconds: t.listenedSeconds,
    averageSecondsWhenCorrect: t.averageSecondsWhenCorrect,
    score: t.score,
    deezerTrackId: t.deezerTrackId,
    distribution: t.distribution,
    notFoundCount: t.notFoundCount,
  }));
}
