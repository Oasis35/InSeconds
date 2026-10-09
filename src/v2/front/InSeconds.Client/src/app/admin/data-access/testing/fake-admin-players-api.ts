import { Provider } from '@angular/core';
import { PlayerGame, RegisteredPlayer } from '../../domain/registered-player';
import { AdminPlayersApi } from '../players.api';

export function registeredPlayer(overrides: Partial<RegisteredPlayer> = {}): RegisteredPlayer {
  return {
    id: 'a', pseudo: 'Alice', email: 'alice@example.com', createdAt: '2026-09-01T10:00:00Z',
    lastSeenAt: '2026-09-24T09:00:00Z', gamesPlayed: 12, isAdmin: false, currentStreak: 0,
    streakFreezes: 0, streakProtected: false, ...overrides,
  };
}

export function playerGame(overrides: Partial<PlayerGame> = {}): PlayerGame {
  return { date: '2026-09-24', status: 'Completed', score: 3200, freezesUsed: 0, freezeEarned: false, ...overrides };
}

function defaults() {
  return {
    list: vi.fn<() => Promise<RegisteredPlayer[]>>(() => Promise.resolve([])),
    history: vi.fn<(playerId: string) => Promise<PlayerGame[]>>(() => Promise.resolve([])),
  } satisfies Record<keyof AdminPlayersApi, unknown>;
}

export type FakeAdminPlayersApi = ReturnType<typeof defaults>;

/** Faux `AdminPlayersApi` : chaque méthode est un espion qui réussit par défaut. */
export function fakeAdminPlayersApi(overrides: Partial<FakeAdminPlayersApi> = {}): FakeAdminPlayersApi {
  return { ...defaults(), ...overrides };
}

export function provideAdminPlayersApiFake(api: FakeAdminPlayersApi): Provider {
  return { provide: AdminPlayersApi, useValue: api };
}
