import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminChallengeStats, DailyClient } from '../../api/daily/api.generated';
import { ChallengesApi } from './challenges.api';

describe('ChallengesApi', () => {
  // Le JSON livre les jours en texte alors que le client les annonce en `Date`.
  const raw = (overrides: Record<string, unknown> = {}) => ({
    id: 4, date: '2026-10-05', playerCount: 2, pendingCount: 0, abandonedCount: 1, expiredCount: 0,
    scoreMin: undefined, scoreMax: undefined, scoreAvg: undefined, scoreMedian: 900,
    tracks: [{
      position: 1, artist: 'A', title: 'T', totalAnswers: 2, artistCorrectRate: 50, titleCorrectRate: 100, extendedRate: 0,
      avgListenedSeconds: undefined, guessTimeDistribution: [{ seconds: 0.5, count: 2 }], notFoundCount: 0,
    }],
    players: [{ playerId: 'p1', status: 'Completed', score: 900, pseudo: undefined }, { playerId: 'p2', status: 'Abandoned', score: 0, pseudo: 'Alice' }],
    computedAt: undefined, canRecompute: true, ...overrides,
  }) as unknown as AdminChallengeStats;

  function setup(client: Partial<Record<keyof DailyClient, unknown>>) {
    TestBed.configureTestingModule({ providers: [{ provide: DailyClient, useValue: client }] });
    return TestBed.inject(ChallengesApi);
  }

  it('rend les stats avec des jours en texte et des valeurs absentes en null', async () => {
    const api = setup({ getChallengeStats: vi.fn(() => of({ challenges: [raw()] })) });

    const [challenge] = await api.loadStats();

    expect(challenge.date).toBe('2026-10-05');
    expect(challenge.scoreMin).toBeNull();
    expect(challenge.scoreMedian).toBe(900);
    expect(challenge.computedAt).toBeNull();
    expect(challenge.tracks[0].avgListenedSeconds).toBeNull();
    expect(challenge.players.map(p => p.pseudo)).toEqual([null, 'Alice']);
    expect(challenge.canRecompute).toBe(true);
  });

  it('garde l\'instant de la photo figée', async () => {
    const api = setup({
      getChallengeStats: vi.fn(() => of({ challenges: [raw({ computedAt: '2026-10-06T00:05:00Z' })] })),
    });

    expect((await api.loadStats())[0].computedAt).toBe('2026-10-06T00:05:00Z');
  });

  it('convertit un Date en jour sans fuseau', async () => {
    const api = setup({
      getChallengeStats: vi.fn(() => of({ challenges: [raw({ date: new Date('2026-10-05T00:00:00Z') })] })),
    });

    expect((await api.loadStats())[0].date).toBe('2026-10-05');
  });

  it('rend l\'historique', async () => {
    const api = setup({
      listChallenges: vi.fn(() => of([{ id: 1, date: '2026-10-04', tracks: [{ position: 1, artist: 'A', title: 'T', deezerTrackId: 9 }] }])),
    });

    expect(await api.listHistory()).toEqual([
      { id: 1, date: '2026-10-04', tracks: [{ position: 1, artist: 'A', title: 'T', deezerTrackId: 9 }] },
    ]);
  });

  it('recalcule un jour et rend le défi recalculé', async () => {
    const recomputeDayStats = vi.fn(() => of(raw({ computedAt: '2026-10-06T10:00:00Z', canRecompute: false })));
    const api = setup({ recomputeDayStats });

    const challenge = await api.recompute('2026-10-05');

    expect(recomputeDayStats).toHaveBeenCalledWith('2026-10-05');
    expect(challenge.computedAt).toBe('2026-10-06T10:00:00Z');
    expect(challenge.canRecompute).toBe(false);
  });
});
