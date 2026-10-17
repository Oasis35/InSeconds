import { Provider } from '@angular/core';
import { CooldownSettings } from '../../domain/actions';
import { ActionsApi } from '../actions.api';

/** Le cooldown du faux : 75 % de 200 morceaux jouables, soit 30 jours. */
export const FAKE_COOLDOWN: CooldownSettings = { poolPercent: 75, days: 30, playableCount: 200 };

function defaults() {
  return {
    getCooldown: vi.fn<() => Promise<CooldownSettings>>(() => Promise.resolve(FAKE_COOLDOWN)),
    updateCooldownPercent: vi.fn<(percent: number) => Promise<CooldownSettings>>(percent =>
      Promise.resolve({ poolPercent: percent, days: Math.floor((200 * percent) / 100 / 5), playableCount: 200 })),
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
