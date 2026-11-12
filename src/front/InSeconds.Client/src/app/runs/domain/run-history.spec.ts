import { RunTrack } from './run';
import { RunHistoryEntry, filterRuns, isMissed, scoreOfDay, tracksByRound } from './run-history';

const track = (over: Partial<RunTrack>): RunTrack => ({
  position: 1, round: 1, neutralized: false, artistCorrect: true, titleCorrect: true, points: 100, artist: 'A', title: 'T', coverUrl: null,
  deezerTrackId: 1, waveform: null, ...over,
});

const run = (sessionId: number, difficulty: RunHistoryEntry['difficulty']): RunHistoryEntry => ({
  sessionId, date: '2026-11-10', disc: { key: 'runs.discs.gold', stars: 0 }, score: 2000, difficulty,
});

describe('historique des setlists', () => {
  it('filtre par difficulté, ou garde tout', () => {
    const runs = [run(1, 'easy'), run(2, 'risky'), run(3, 'easy')];

    expect(filterRuns(runs, 'all')).toHaveLength(3);
    expect(filterRuns(runs, 'easy').map(r => r.sessionId)).toEqual([1, 3]);
    expect(filterRuns(runs, 'safe')).toEqual([]);
  });

  it("un morceau est raté s'il manque l'artiste ou le titre ; un morceau retiré ne l'est pas", () => {
    expect(isMissed(track({}))).toBe(false);
    expect(isMissed(track({ titleCorrect: false }))).toBe(true);
    expect(isMissed(track({ artistCorrect: false, titleCorrect: false }))).toBe(true);
    expect(isMissed(track({ neutralized: true, artistCorrect: false, titleCorrect: false }))).toBe(false);
  });

  it('range les morceaux par manche, et ne garde que les ratés sur demande', () => {
    const tracks = [track({ position: 6, round: 2, titleCorrect: false }), track({ position: 1, round: 1 }), track({ position: 2, round: 1, artistCorrect: false })];

    expect(tracksByRound(tracks, false).map(r => [r.round, r.tracks.map(t => t.position)])).toEqual([[1, [1, 2]], [2, [6]]]);
    expect(tracksByRound(tracks, true).map(r => [r.round, r.tracks.map(t => t.position)])).toEqual([[1, [2]], [2, [6]]]);
    expect(tracksByRound([track({})], true)).toEqual([]);
  });

  it("le score de la dernière setlist d'un jour, rien sans partie ce jour-là", () => {
    const runs: RunHistoryEntry[] = [{ ...run(3, 'safe'), date: '2026-11-12', score: 2980 }, { ...run(2, 'safe'), date: '2026-11-12', score: 1500 }, run(1, 'easy')];
    expect(scoreOfDay(runs, '2026-11-12')).toBe(2980);
    expect(scoreOfDay(runs, '2026-11-11')).toBeNull();
    expect(scoreOfDay([], '2026-11-12')).toBeNull();
  });
});
