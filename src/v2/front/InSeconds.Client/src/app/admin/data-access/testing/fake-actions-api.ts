import { Provider } from '@angular/core';
import { ActionsApi } from '../actions.api';

function defaults() {
  return {
    getCooldownDays: vi.fn<() => Promise<number>>(() => Promise.resolve(30)),
    updateCooldownDays: vi.fn<(days: number) => Promise<number>>(days => Promise.resolve(days)),
  } satisfies Record<keyof ActionsApi, unknown>;
}

export type FakeActionsApi = ReturnType<typeof defaults>;

/** Faux `ActionsApi` : chaque méthode est un espion qui réussit par défaut ; les tests remplacent ce qui les intéresse. */
export function fakeActionsApi(overrides: Partial<FakeActionsApi> = {}): FakeActionsApi {
  return { ...defaults(), ...overrides };
}

export function provideActionsApiFake(api: FakeActionsApi): Provider {
  return { provide: ActionsApi, useValue: api };
}
