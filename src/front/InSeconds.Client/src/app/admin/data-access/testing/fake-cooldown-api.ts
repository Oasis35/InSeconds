import { Provider } from '@angular/core';
import { CooldownSettings } from '../../domain/cooldown';
import { CooldownApi } from '../cooldown.api';

/** Le cooldown du faux : 75 % de 200 morceaux jouables, soit 30 jours. */
export const FAKE_COOLDOWN: CooldownSettings = { poolPercent: 75, days: 30, playableCount: 200 };

function defaults() {
  return {
    getCooldown: vi.fn<() => Promise<CooldownSettings>>(() => Promise.resolve(FAKE_COOLDOWN)),
    updateCooldownPercent: vi.fn<(percent: number) => Promise<CooldownSettings>>(percent =>
      Promise.resolve({ poolPercent: percent, days: Math.floor((200 * percent) / 100 / 5), playableCount: 200 })),
  } satisfies Record<keyof CooldownApi, unknown>;
}

export type FakeCooldownApi = ReturnType<typeof defaults>;

/** Faux `CooldownApi` : chaque méthode est un espion qui réussit par défaut ; les tests remplacent ce qui les intéresse. */
export function fakeCooldownApi(overrides: Partial<FakeCooldownApi> = {}): FakeCooldownApi {
  return { ...defaults(), ...overrides };
}

export function provideCooldownApiFake(api: FakeCooldownApi): Provider {
  return { provide: CooldownApi, useValue: api };
}
