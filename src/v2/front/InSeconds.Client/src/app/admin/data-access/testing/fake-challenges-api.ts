import { Provider } from '@angular/core';
import {
  ChallengeHistoryEntry, ChallengePlayer, ChallengeStats, ChallengeTrackStats,
} from '../../domain/challenge';
import { ChallengesApi } from '../challenges.api';

export function challengeTrack(overrides: Partial<ChallengeTrackStats> = {}): ChallengeTrackStats {
  return {
    position: 1, artist: 'Eminem', title: 'Lose Yourself', totalAnswers: 4, artistCorrectRate: 75, titleCorrectRate: 50,
    extendedRate: 25, avgListenedSeconds: 1.5,
    guessTimeDistribution: [{ seconds: 0.5, count: 1 }, { seconds: 1, count: 2 }], notFoundCount: 1, ...overrides,
  };
}

export function challengePlayer(overrides: Partial<ChallengePlayer> = {}): ChallengePlayer {
  return { playerId: 'aaaaaaaa-1111-2222-3333-444444444444', status: 'Completed', score: 1200, pseudo: null, ...overrides };
}

export function challengeStats(overrides: Partial<ChallengeStats> = {}): ChallengeStats {
  return {
    id: 1, date: '2026-10-05', playerCount: 1, pendingCount: 0, abandonedCount: 0, expiredCount: 0,
    scoreMin: 1200, scoreMax: 1200, scoreAvg: 1200, scoreMedian: 1200,
    tracks: [challengeTrack()], players: [challengePlayer()], computedAt: null, canRecompute: false, ...overrides,
  };
}

export function historyEntry(overrides: Partial<ChallengeHistoryEntry> = {}): ChallengeHistoryEntry {
  return {
    id: 1, date: '2026-10-05',
    tracks: [{ position: 1, artist: 'Eminem', title: 'Lose Yourself', deezerTrackId: 11 }], ...overrides,
  };
}

function defaults() {
  return {
    loadStats: vi.fn<() => Promise<ChallengeStats[]>>(() => Promise.resolve([])),
    listHistory: vi.fn<() => Promise<ChallengeHistoryEntry[]>>(() => Promise.resolve([])),
    recompute: vi.fn<(day: string) => Promise<ChallengeStats>>(() => Promise.resolve(challengeStats())),
  } satisfies Record<keyof ChallengesApi, unknown>;
}

export type FakeChallengesApi = ReturnType<typeof defaults>;

/** Faux `ChallengesApi` : chaque méthode est un espion qui réussit par défaut ; les tests remplacent ce qui les intéresse. */
export function fakeChallengesApi(overrides: Partial<FakeChallengesApi> = {}): FakeChallengesApi {
  return { ...defaults(), ...overrides };
}

export function provideChallengesApiFake(api: FakeChallengesApi): Provider {
  return { provide: ChallengesApi, useValue: api };
}
