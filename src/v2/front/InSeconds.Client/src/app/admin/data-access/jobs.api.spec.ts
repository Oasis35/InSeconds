import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminClient } from '../../api/admin/api.generated';
import { JobsApi } from './jobs.api';

describe('JobsApi', () => {
  const client = { getJobLastRuns: vi.fn() };
  let api: JobsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: AdminClient, useValue: client }] });
    api = TestBed.inject(JobsApi);
  });

  it('rend le dernier passage de chaque tâche, instants en texte ISO', async () => {
    client.getJobLastRuns.mockReturnValue(of([
      {
        id: 'catalogue-refresh', state: 'succeeded', at: '2026-10-08T23:01:12Z', result: { checked: 12, updated: 3, failed: 0 },
        errorCode: undefined, retryAt: undefined, nextRunAt: new Date('2026-10-09T23:00:00Z'),
      },
    ]));

    expect(await api.getLastRuns()).toEqual([{
      id: 'catalogue-refresh', state: 'succeeded', at: '2026-10-08T23:01:12Z', result: { checked: 12, updated: 3, failed: 0 },
      errorCode: null, retryAt: null, nextRunAt: '2026-10-09T23:00:00.000Z',
    }]);
  });

  it('jamais lancée : ni état, ni date, ni compte rendu ; un compte rendu qui n\'est pas un objet est ignoré', async () => {
    client.getJobLastRuns.mockReturnValue(of([
      { id: 'a', state: undefined, at: undefined, result: undefined, errorCode: undefined, retryAt: undefined, nextRunAt: undefined },
      { id: 'b', state: 'retry_scheduled', at: '2026-10-09T00:00:03Z', result: [1, 2], errorCode: 'admin.pool_insufficient', retryAt: '2026-10-09T00:10:03Z', nextRunAt: undefined },
    ]));

    const [never, retry] = await api.getLastRuns();

    expect(never).toEqual({ id: 'a', state: null, at: null, result: null, errorCode: null, retryAt: null, nextRunAt: null });
    expect(retry).toMatchObject({ state: 'retry_scheduled', result: null, errorCode: 'admin.pool_insufficient', retryAt: '2026-10-09T00:10:03Z' });
  });
});
