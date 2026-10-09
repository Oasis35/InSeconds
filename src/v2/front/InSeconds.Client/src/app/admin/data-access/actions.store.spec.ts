import { TestBed } from '@angular/core/testing';
import { JobState, JobStatus } from '../domain/job';
import { ActionsStore, RESULT_VISIBLE_MS } from './actions.store';
import { JOBS_DASHBOARD_URL } from './admin-api.providers';
import { JobRunner } from './job-runner';
import { fakeActionsApi, FakeActionsApi, provideActionsApiFake } from './testing/fake-actions-api';
import { fakeCatalogueApi, problem, provideCatalogueApiFake } from './testing/fake-catalogue-api';

function job(state: JobState, result: Record<string, unknown> | null = null, errorCode: string | null = null): JobStatus {
  return { id: 'job-1', state, result, errorCode };
}

describe('ActionsStore', () => {
  let api: FakeActionsApi;
  let runner: { follow: ReturnType<typeof vi.fn> };
  let catalogue: ReturnType<typeof fakeCatalogueApi>;

  function create(overrides: Partial<FakeActionsApi> = {}) {
    api = fakeActionsApi(overrides);
    catalogue = fakeCatalogueApi();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ActionsStore,
        provideActionsApiFake(api),
        provideCatalogueApiFake(catalogue),
        { provide: JobRunner, useValue: runner },
        { provide: JOBS_DASHBOARD_URL, useValue: '/jobs' },
      ],
    });
    return TestBed.inject(ActionsStore);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    runner = { follow: vi.fn(async () => job('succeeded', { created: true })) };
  });
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

  describe('génération', () => {
    it('suit l\'exécution (en file, en cours) puis rend l\'issue, effacée au bout de 3 s', async () => {
      const phases: string[] = [];
      let store!: InstanceType<typeof ActionsStore>;
      runner.follow.mockImplementation(async (_id: string, onUpdate: (s: JobStatus) => void) => {
        onUpdate(job('queued'));
        phases.push(store.generatePhase());
        onUpdate(job('processing'));
        phases.push(store.generatePhase());
        return job('succeeded', { created: true });
      });
      store = create();
      await store.generateToday();
      expect(phases).toEqual(['queued', 'running']);
      expect(store.generatePhase()).toBe('idle');
      expect(store.generateOutcome()).toBe('created');
      vi.advanceTimersByTime(RESULT_VISIBLE_MS);
      expect(store.generateOutcome()).toBeNull();
    });

    it('« déjà généré », pool insuffisant, erreur générique, réessai prévu', async () => {
      const store = create();
      runner.follow.mockResolvedValueOnce(job('succeeded', { created: false }));
      await store.generateToday();
      expect(store.generateOutcome()).toBe('already');

      runner.follow.mockResolvedValueOnce(job('failed', null, 'admin.pool_insufficient'));
      await store.generateToday();
      expect(store.generateOutcome()).toBe('pool_insufficient');

      runner.follow.mockResolvedValueOnce(job('failed', null, 'common.unexpected'));
      await store.generateToday();
      expect(store.generateOutcome()).toBe('error');

      runner.follow.mockResolvedValueOnce(job('retry_scheduled'));
      await store.generateToday();
      expect(store.generateOutcome()).toBe('retry');
      vi.advanceTimersByTime(RESULT_VISIBLE_MS);
      expect(store.generateOutcome()).toBe('retry');
    });

    it('une erreur de lancement donne l\'erreur générique', async () => {
      const store = create({ generateToday: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });
      await store.generateToday();
      expect(store.generateOutcome()).toBe('error');
      expect(store.generatePhase()).toBe('idle');
    });

    it('un second clic pendant l\'exécution ne relance rien', async () => {
      let finish!: (status: JobStatus) => void;
      runner.follow.mockImplementation(() => new Promise<JobStatus>(resolve => { finish = resolve; }));
      const store = create();
      const first = store.generateToday();
      await vi.advanceTimersByTimeAsync(0);
      await store.generateToday();
      expect(api.generateToday).toHaveBeenCalledTimes(1);
      finish(job('succeeded', { created: true }));
      await first;
    });
  });

  describe('contrôle des extraits', () => {
    it('rend le compte rendu, effacé au bout de 3 s', async () => {
      runner.follow.mockResolvedValue(job('succeeded', { checked: 200, updated: 3, failed: 1 }));
      const store = create();
      await store.refreshPreviews();
      expect(catalogue.refreshPreviews).toHaveBeenCalledTimes(1);
      expect(store.refreshResult()).toEqual({ kind: 'report', report: { checked: 200, updated: 3, failed: 1 } });
      vi.advanceTimersByTime(RESULT_VISIBLE_MS);
      expect(store.refreshResult()).toBeNull();
    });

    it('échec de la tâche ou de la lecture : erreur', async () => {
      runner.follow.mockResolvedValue(job('failed', null, 'common.unexpected'));
      const store = create();
      await store.refreshPreviews();
      expect(store.refreshResult()).toEqual({ kind: 'error' });

      runner.follow.mockRejectedValue(problem(500, 'common.unexpected'));
      await store.refreshPreviews();
      expect(store.refreshResult()).toEqual({ kind: 'error' });
      expect(store.refreshPhase()).toBe('idle');
    });

    it('reste « en cours » tant que la tâche n\'est pas terminée, sans relancer', async () => {
      let finish!: (status: JobStatus) => void;
      runner.follow.mockImplementation(() => new Promise<JobStatus>(resolve => { finish = resolve; }));
      const store = create();
      const run = store.refreshPreviews();
      await vi.advanceTimersByTimeAsync(0);
      expect(store.refreshPhase()).toBe('queued');
      await store.refreshPreviews();
      expect(catalogue.refreshPreviews).toHaveBeenCalledTimes(1);
      finish(job('succeeded', { checked: 1, updated: 0, failed: 0 }));
      await run;
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
