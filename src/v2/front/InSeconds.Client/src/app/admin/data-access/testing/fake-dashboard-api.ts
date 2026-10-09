import { Provider } from '@angular/core';
import { Dashboard, Day } from '../../domain/dashboard';
import { DashboardApi } from '../dashboard.api';

export function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    activity: [
      { day: '2026-10-04', playerCount: 2 },
      { day: '2026-10-05', playerCount: 4 },
    ],
    players: { totalGuests: 10, totalRegistered: 3, activeLast7Days: 5, activeLast30Days: 8 },
    availableDays: ['2026-10-05', '2026-10-04', '2026-10-02'],
    kpis: {
      day: '2026-10-05', completedCount: 4, abandonedCount: 1, expiredCount: 1, pendingCount: 0,
      totalSessions: 6, completionRate: 66.7, medianScore: 4200,
    },
    ...overrides,
  };
}

function defaults() {
  return {
    getDashboard: vi.fn<(day?: Day) => Promise<Dashboard>>(() => Promise.resolve(dashboard())),
  } satisfies Record<keyof DashboardApi, unknown>;
}

export type FakeDashboardApi = ReturnType<typeof defaults>;

/** Faux `DashboardApi` : un espion qui rend un tableau de bord par défaut ; les tests remplacent ce qui les intéresse. */
export function fakeDashboardApi(overrides: Partial<FakeDashboardApi> = {}): FakeDashboardApi {
  return { ...defaults(), ...overrides };
}

export function provideDashboardApiFake(api: FakeDashboardApi): Provider {
  return { provide: DashboardApi, useValue: api };
}
