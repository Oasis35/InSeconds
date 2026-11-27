import { TestBed } from '@angular/core/testing';
import { StatsStore } from './stats.store';
import { FakeStatsApi, fakeStatsApi, provideStatsApiFake } from './testing/fake-stats-api';

describe('StatsStore', () => {
  function setup(api: FakeStatsApi = fakeStatsApi()) {
    TestBed.configureTestingModule({ providers: [provideStatsApiFake(api), StatsStore] });
    return { api, store: TestBed.inject(StatsStore) };
  }

  it('charge la période par défaut', async () => {
    const { api, store } = setup();
    await store.load(store.period());
    expect(api.getStats).toHaveBeenCalledWith(30);
    expect(store.isFulfilled()).toBe(true);
    expect(store.stats()?.days).toBe(30);
  });

  it('changer de période relit, la même période ne relit pas', async () => {
    const { api, store } = setup();
    await store.selectPeriod(30);
    expect(api.getStats).not.toHaveBeenCalled();
    await store.selectPeriod(7);
    expect(api.getStats).toHaveBeenCalledWith(7);
    expect(store.period()).toBe(7);
  });

  it('un échec garde l\'erreur', async () => {
    const { store } = setup(fakeStatsApi({ getStats: vi.fn(() => Promise.reject(new Error('x'))) }));
    await store.load(30);
    expect(store.error()).not.toBeNull();
  });
});
