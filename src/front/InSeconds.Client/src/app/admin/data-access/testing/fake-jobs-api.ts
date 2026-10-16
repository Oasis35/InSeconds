import { Provider } from '@angular/core';
import { JobLastRun } from '../../domain/job';
import { JobsApi } from '../jobs.api';

function defaults() {
  return {
    getLastRuns: vi.fn<() => Promise<JobLastRun[]>>(() => Promise.resolve([])),
  } satisfies Record<keyof JobsApi, unknown>;
}

export type FakeJobsApi = ReturnType<typeof defaults>;

/** Faux `JobsApi` : aucune tâche passée par défaut ; les tests remplacent ce qui les intéresse. */
export function fakeJobsApi(overrides: Partial<FakeJobsApi> = {}): FakeJobsApi {
  return { ...defaults(), ...overrides };
}

export function provideJobsApiFake(api: FakeJobsApi): Provider {
  return { provide: JobsApi, useValue: api };
}
