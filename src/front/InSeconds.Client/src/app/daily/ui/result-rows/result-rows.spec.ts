import { AnsweredTrack, DayStats, TrackStat } from '../../domain/daily';
import { rowsFromResults, rowsFromStats } from './result-rows';

const answered = (over: Partial<AnsweredTrack> = {}): AnsweredTrack => ({
  position: 1, artistCorrect: true, titleCorrect: true, score: 1000, listenedSeconds: 0.5, hintLevel: 0,
  correctArtist: 'Eminem', correctTitle: 'Lose Yourself', deezerTrackId: 42, coverUrl: null,
  averageSecondsWhenCorrect: 0.5, distribution: [], notFoundCount: 0,
  ...over,
});

const track = (over: Partial<TrackStat> = {}): TrackStat => ({
  position: 1, artist: 'Eminem', title: 'Lose Yourself', deezerTrackId: 42, coverUrl: 'http://x/c.jpg',
  averageSecondsWhenCorrect: 0.9, artistCorrect: true, titleCorrect: true,
  listenedSeconds: 0.5, score: 1000, distribution: [{ durationSeconds: 0.5, count: 2 }], notFoundCount: 1,
  ...over,
});

const stats = (tracks: TrackStat[]): DayStats => ({
  yourScore: 1000, medianScore: 1000, totalPlayers: 1, currentStreak: 1, freezesUsed: 0, freezeMilestone: false,
  minScore: 1000, maxScore: 1000, maxPossibleScore: 5000, scoreDistribution: [], betterThanPercent: null, tracks,
});

describe('rowsFromResults', () => {
  it('garde les chiffres de la réponse quand elle porte son histogramme', () => {
    const [row] = rowsFromResults([answered({ distribution: [{ durationSeconds: 1, count: 5 }], notFoundCount: 2 })], stats([track()]));
    expect(row.distribution).toEqual([{ durationSeconds: 1, count: 5 }]);
    expect(row.notFoundCount).toBe(2);
  });

  it('complète une réponse relue à la reprise avec les stats, par position', () => {
    const [row] = rowsFromResults([answered()], stats([track()]));
    expect(row.distribution).toEqual([{ durationSeconds: 0.5, count: 2 }]);
    expect(row.notFoundCount).toBe(1);
    expect(row.averageSecondsWhenCorrect).toBe(0.9);
    expect(row.coverUrl).toBe('http://x/c.jpg');
  });

  it('fonctionne sans stats (histogramme vide)', () => {
    const rows = rowsFromResults([answered()], null);
    expect(rows[0]).toEqual(expect.objectContaining({ artist: 'Eminem', title: 'Lose Yourself', score: 1000, notFoundCount: 0, distribution: [] }));
  });
});

describe('rowsFromStats', () => {
  it('garde null les champs du joueur sans partie terminée', () => {
    const [row] = rowsFromStats(stats([track({ artistCorrect: null, titleCorrect: null, listenedSeconds: null, score: null, coverUrl: null })]));
    expect(row.artistCorrect).toBeNull();
    expect(row.score).toBeNull();
  });

  it('vide sans stats', () => {
    expect(rowsFromStats(null)).toEqual([]);
  });
});
