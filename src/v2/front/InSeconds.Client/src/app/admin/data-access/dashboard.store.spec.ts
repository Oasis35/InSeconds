import { TestBed } from '@angular/core/testing';
import { DashboardStore } from './dashboard.store';
import {
  FakeDashboardApi, dashboard, fakeDashboardApi, provideDashboardApiFake,
} from './testing/fake-dashboard-api';
import { Dashboard } from '../domain/dashboard';

describe('DashboardStore', () => {
  function setup(api: FakeDashboardApi = fakeDashboardApi()) {
    TestBed.configureTestingModule({ providers: [provideDashboardApiFake(api), DashboardStore] });
    return { api, store: TestBed.inject(DashboardStore) };
  }

  afterEach(() => vi.useRealTimers());

  it('charge sans jour : le jour affiché est celui des KPI', async () => {
    const { api, store } = setup();

    await store.load();

    expect(api.getDashboard).toHaveBeenCalledWith(undefined);
    expect(store.selectedDay()).toBe('2026-10-05');
    expect(store.isFulfilled()).toBe(true);
    expect(store.totalPlayers()).toBe(6);
    expect(store.maxDailyPlayers()).toBe(4);
  });

  it('sans défi aujourd\'hui, le jour affiché est aujourd\'hui (UTC)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
    const { store } = setup(fakeDashboardApi({
      getDashboard: vi.fn(async () => dashboard({ kpis: null })),
    }));

    await store.load();

    expect(store.selectedDay()).toBe('2026-10-06');
    expect(store.isSelectedDayToday()).toBe(true);
    expect(store.dashboard()?.kpis).toBeNull();
  });

  it('choisir un jour relit avec ce jour ; le même jour ne relit pas', async () => {
    const { api, store } = setup();
    await store.load();

    await store.selectDay('2026-10-04');
    await store.selectDay('2026-10-04');

    expect(api.getDashboard).toHaveBeenCalledTimes(2);
    expect(api.getDashboard).toHaveBeenLastCalledWith('2026-10-04');
    expect(store.selectedDay()).toBe('2026-10-04');
  });

  it('jour précédent et suivant suivent les jours disponibles', async () => {
    const { api, store } = setup();
    await store.load();
    expect(store.canGoToNextDay()).toBe(false);
    expect(store.canGoToPreviousDay()).toBe(true);

    await store.shiftDay(-1);
    expect(api.getDashboard).toHaveBeenLastCalledWith('2026-10-04');

    await store.shiftDay(1);
    expect(api.getDashboard).toHaveBeenLastCalledWith('2026-10-05');

    const calls = api.getDashboard.mock.calls.length;
    await store.shiftDay(1);
    expect(api.getDashboard).toHaveBeenCalledTimes(calls);
  });

  it('garde l\'affichage pendant qu\'un autre jour se charge', async () => {
    let resolve!: (value: Dashboard) => void;
    const { api, store } = setup();
    await store.load();
    api.getDashboard.mockImplementationOnce(() => new Promise<Dashboard>(r => { resolve = r; }));

    const pending = store.selectDay('2026-10-04');

    expect(store.isPending()).toBe(true);
    expect(store.dashboard()).not.toBeNull();
    resolve(dashboard());
    await pending;
    expect(store.isFulfilled()).toBe(true);
  });

  it('une lecture plus ancienne arrivée après la plus récente n\'écrit rien', async () => {
    const resolvers: ((value: Dashboard) => void)[] = [];
    const { api, store } = setup(fakeDashboardApi());
    api.getDashboard.mockImplementation(() => new Promise<Dashboard>(r => { resolvers.push(r); }));

    const first = store.load('2026-10-02');
    const second = store.load('2026-10-04');
    resolvers[1](dashboard({ availableDays: ['2026-10-04'] }));
    await second;
    resolvers[0](dashboard({ availableDays: ['2026-10-02'] }));
    await first;

    expect(store.selectedDay()).toBe('2026-10-04');
    expect(store.dashboard()?.availableDays).toEqual(['2026-10-04']);
  });

  it('une erreur est gardée avec son code', async () => {
    const { store } = setup(fakeDashboardApi({
      getDashboard: vi.fn(() => Promise.reject({ status: 500, code: 'common.unexpected', traceId: 'trace-1' })),
    }));

    await store.load();

    expect(store.error()?.code).toBe('common.unexpected');
    expect(store.error()?.traceId).toBe('trace-1');
    expect(store.dashboard()).toBeNull();
  });
});
