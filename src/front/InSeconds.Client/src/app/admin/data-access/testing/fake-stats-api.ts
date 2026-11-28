import { Provider } from '@angular/core';
import { Stats } from '../../domain/stats';
import { StatsApi } from '../stats.api';

export function stats(overrides: Partial<Stats> = {}): Stats {
  return {
    days: 30,
    daily: [
      { day: '2026-11-24', completed: 6, abandoned: 1, expired: 1, players: 8, firstTimePlayers: 3 },
      { day: '2026-11-25', completed: 9, abandoned: 0, expired: 2, players: 11, firstTimePlayers: 5 },
    ],
    medianScore: 3100,
    overall: { key: 'all', newPlayers: 20, day1Eligible: 18, day1Returned: 9, day7Eligible: 10, day7Returned: 3 },
    sources: [
      { key: 'instagram', newPlayers: 12, day1Eligible: 10, day1Returned: 4, day7Eligible: 6, day7Returned: 1 },
      { key: 'direct', newPlayers: 6, day1Eligible: 6, day1Returned: 4, day7Eligible: 3, day7Returned: 2 },
      { key: 'google.com', newPlayers: 2, day1Eligible: 2, day1Returned: 1, day7Eligible: 1, day7Returned: 0 },
    ],
    devices: [
      { key: 'phone', newPlayers: 15, day1Eligible: 14, day1Returned: 7, day7Eligible: 8, day7Returned: 2 },
      { key: 'desktop', newPlayers: 5, day1Eligible: 4, day1Returned: 2, day7Eligible: 2, day7Returned: 1 },
    ],
    answers: {
      total: 100, artistFound: 60, titleFound: 50,
      byListened: [{ seconds: 0.5, count: 10 }, { seconds: 1, count: 30 }, { seconds: 2, count: 25 }],
    },
    ...overrides,
  };
}

function defaults() {
  return { getStats: vi.fn<(days: number) => Promise<Stats>>(days => Promise.resolve(stats({ days }))) } satisfies Record<keyof StatsApi, unknown>;
}

export type FakeStatsApi = ReturnType<typeof defaults>;

export function fakeStatsApi(overrides: Partial<FakeStatsApi> = {}): FakeStatsApi {
  return { ...defaults(), ...overrides };
}

export function provideStatsApiFake(api: FakeStatsApi): Provider {
  return { provide: StatsApi, useValue: api };
}
