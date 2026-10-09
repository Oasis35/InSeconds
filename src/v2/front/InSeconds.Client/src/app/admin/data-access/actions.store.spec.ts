import { TestBed } from '@angular/core/testing';
import { JobLastRun } from '../domain/job';
import { ActionsStore, RESULT_VISIBLE_MS } from './actions.store';
import { JOBS_DASHBOARD_URL } from './admin-api.providers';
import { fakeActionsApi, FakeActionsApi, provideActionsApiFake } from './testing/fake-actions-api';
import { problem } from './testing/fake-catalogue-api';
import { fakeJobsApi, FakeJobsApi, provideJobsApiFake } from './testing/fake-jobs-api';

const GENERATED: JobLastRun = {
  id: 'daily-generate-challenge', state: 'succeeded', at: '2026-10-09T00:00:03Z', result: { created: true },
  errorCode: null, retryAt: null, nextRunAt: '2026-10-10T00:00:00Z',
};

describe('ActionsStore', () => {
  let api: FakeActionsApi;
  let jobs: FakeJobsApi;

  function create(overrides: Partial<FakeActionsApi> = {}, jobOverrides: Partial<FakeJobsApi> = {}) {
    api = fakeActionsApi(overrides);
    jobs = fakeJobsApi(jobOverrides);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ActionsStore, provideActionsApiFake(api), provideJobsApiFake(jobs), { provide: JOBS_DASHBOARD_URL, useValue: '/jobs' }],
    });
    return TestBed.inject(ActionsStore);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expose l\'adresse du tableau de bord des tâches', () => {
    expect(create().jobsDashboardUrl).toBe('/jobs');
  });

  it('lit le délai à l\'ouverture, ou garde l\'erreur', async () => {
    const store = create();
    await store.load();
    expect(store.cooldownDays()).toBe(30);
    expect(store.isFulfilled()).toBe(true);

    const failing = create({ getCooldownDays: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });
    await failing.load();
    expect(failing.error()?.code).toBe('common.unexpected');
  });

  describe('derniers passages des tâches', () => {
    it('lus à l\'ouverture, avec le délai', async () => {
      const store = create({}, { getLastRuns: vi.fn(() => Promise.resolve([GENERATED])) });
      expect(store.lastRuns()).toBeNull();
      await store.load();
      expect(store.lastRuns()).toEqual([GENERATED]);
      expect(store.lastRunsFailed()).toBe(false);
      expect(store.cooldownDays()).toBe(30);
    });

    it('lecture en échec : signalée, sans toucher au délai', async () => {
      const store = create({}, { getLastRuns: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });
      await store.load();
      expect(store.lastRunsFailed()).toBe(true);
      expect(store.lastRuns()).toBeNull();
      expect(store.cooldownDays()).toBe(30);
      expect(store.error()).toBeNull();
    });
  });

  describe('délai de réutilisation', () => {
    it('enregistre, garde la valeur renvoyée, message effacé au bout de 3 s', async () => {
      const store = create();
      await store.saveCooldown(45);
      expect(api.updateCooldownDays).toHaveBeenCalledWith(45);
      expect(store.cooldownDays()).toBe(45);
      expect(store.cooldownSave()).toBe('saved');
      vi.advanceTimersByTime(RESULT_VISIBLE_MS);
      expect(store.cooldownSave()).toBe('idle');
    });

    it('échec : erreur, valeur inchangée', async () => {
      const store = create({ updateCooldownDays: vi.fn(() => Promise.reject(problem(400, 'common.validation'))) });
      await store.saveCooldown(0);
      expect(store.cooldownSave()).toBe('error');
      expect(store.cooldownDays()).toBeNull();
    });
  });
});
