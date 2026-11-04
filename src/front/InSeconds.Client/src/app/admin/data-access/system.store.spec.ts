import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HealthService } from '../../core/health/health.service';
import { JobLastRun } from '../domain/job';
import { FRONT_BUILD, FrontBuild, SystemStore } from './system.store';
import { fakeJobsApi, provideJobsApiFake } from './testing/fake-jobs-api';
import { FAKE_SYSTEM_INFO, FakeGithubCiApi, FakeSystemApi, fakeGithubCiApi, fakeSystemApi, provideSystemApisFake } from './testing/fake-system-apis';

const COMMIT = FAKE_SYSTEM_INFO.commit as string;

describe('SystemStore', () => {
  let system: FakeSystemApi;
  let github: FakeGithubCiApi;
  const health = { state: signal<'loading' | 'ok' | 'ko'>('ok'), latencyMs: signal<number | null>(38) };

  async function create(options: {
    build?: Partial<FrontBuild>; system?: Partial<FakeSystemApi>; github?: Partial<FakeGithubCiApi>; runs?: JobLastRun[];
  } = {}) {
    system = fakeSystemApi(options.system);
    github = fakeGithubCiApi(options.github);
    TestBed.configureTestingModule({
      providers: [
        SystemStore,
        provideSystemApisFake(system, github),
        provideJobsApiFake(fakeJobsApi({ getLastRuns: vi.fn(() => Promise.resolve(options.runs ?? [])) })),
        { provide: HealthService, useValue: health },
        { provide: FRONT_BUILD, useValue: { deployedAt: '2026-11-04T09:12:00Z', commit: COMMIT, branch: 'main', ...options.build } },
      ],
    });
    const store = TestBed.inject(SystemStore);
    await store.load();
    return store;
  }

  it('lit l\'API, les tâches et la CI des deux branches ; tout est à jour, aucune alerte', async () => {
    const store = await create();

    expect(store.info()).toEqual(FAKE_SYSTEM_INFO);
    expect(github.latestRun.mock.calls.map(c => c[0])).toEqual(['main', 'env/staging']);
    expect(store.branchHead()).toBe(COMMIT);
    expect(store.verdict()).toBe('aligned');
    expect(store.jobs()?.map(j => j.id)).toHaveLength(4);
    expect(store.alerts()).toBe(0);
  });

  it('la branche a un commit plus récent que celui déployé : en retard, une alerte', async () => {
    const store = await create({
      github: { latestRun: vi.fn(branch => Promise.resolve({ branch, headSha: 'ffffffff', state: 'running' as const, url: '' })) },
    });

    expect(store.verdict()).toBe('pending');
    expect(store.alerts()).toBe(1);
  });

  it('front et API de deux commits différents : désalignés', async () => {
    const store = await create({ build: { commit: '0000000' } });

    expect(store.verdict()).toBe('mismatch');
  });

  it('une tâche en échec et une CI rouge comptent chacune une alerte', async () => {
    const failed: JobLastRun = { id: 'daily-close-day', state: 'failed', at: '2026-11-04T00:05:00Z', result: null, errorCode: null, retryAt: null, nextRunAt: null };
    const store = await create({
      runs: [failed],
      github: { latestRun: vi.fn(branch => Promise.resolve({ branch, headSha: COMMIT, state: branch === 'main' ? 'success' as const : 'failure' as const, url: '' })) },
    });

    expect(store.alerts()).toBe(2);
  });

  it('une lecture en échec n\'empêche pas les autres', async () => {
    const store = await create({ system: { getInfo: vi.fn(() => Promise.reject(new Error('500'))) } });

    expect(store.infoFailed()).toBe(true);
    expect(store.verdict()).toBe('unknown');
    expect(store.ciRuns().every(c => c.run !== null)).toBe(true);
  });

  it('en local et en E2E, aucune branche : pas de commit attendu', async () => {
    const store = await create({ build: { branch: null, commit: null } });

    expect(store.branchHead()).toBeNull();
    expect(store.verdict()).toBe('unknown');
  });
});
