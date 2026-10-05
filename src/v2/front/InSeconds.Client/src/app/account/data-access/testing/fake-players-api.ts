import { Provider } from '@angular/core';
import { SessionPlayer } from '../../../core/session/session.store';
import { Device } from '../../domain/device';
import { PlayersApi } from '../players.api';

/** Erreur telle que la lève le client NSwag quand l'API répond par un `ProblemDetails` (cf. `toAppError`). */
export function problem(status: number, code: string, traceId = '0123456789abcdef0123456789abcdef') {
  return { status, code, traceId };
}

export const linkedPlayer: SessionPlayer = {
  id: 'p1', pseudo: 'Alice', email: 'alice@example.com', isGuest: false, isAdmin: false,
};

export function device(overrides: Partial<Device> = {}): Device {
  return { id: 1, label: 'Chrome · Windows', lastSeenAt: new Date('2026-10-05T10:00:00Z'), isCurrent: false, ...overrides };
}

function defaults() {
  return {
    getMe: vi.fn<() => Promise<SessionPlayer | null>>(() => Promise.resolve(null)),
    createGuest: vi.fn<() => Promise<string>>(() => Promise.resolve('guest-1')),
    requestMagicLink: vi.fn<(email: string) => Promise<void>>(() => Promise.resolve()),
    verifyMagicLink: vi.fn<(token: string, pseudo?: string) => Promise<{ needsPseudo: boolean }>>(
      () => Promise.resolve({ needsPseudo: false }),
    ),
    logout: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    updatePseudo: vi.fn<(pseudo: string) => Promise<string>>(pseudo => Promise.resolve(pseudo)),
    requestEmailChange: vi.fn<(newEmail: string) => Promise<void>>(() => Promise.resolve()),
    confirmEmailChange: vi.fn<(token: string) => Promise<string>>(() => Promise.resolve('nouveau@example.com')),
    listDevices: vi.fn<() => Promise<Device[]>>(() => Promise.resolve([])),
    revokeDevice: vi.fn<(id: number) => Promise<void>>(() => Promise.resolve()),
    revokeOtherDevices: vi.fn<() => Promise<number>>(() => Promise.resolve(0)),
  } satisfies Record<keyof PlayersApi, unknown>;
}

export type FakePlayersApi = ReturnType<typeof defaults>;

/** Faux `PlayersApi` : chaque méthode est un espion qui réussit par défaut ; les tests remplacent ce qui les intéresse. */
export function fakePlayersApi(overrides: Partial<FakePlayersApi> = {}): FakePlayersApi {
  return { ...defaults(), ...overrides };
}

export function providePlayersApiFake(api: FakePlayersApi): Provider {
  return { provide: PlayersApi, useValue: api };
}
