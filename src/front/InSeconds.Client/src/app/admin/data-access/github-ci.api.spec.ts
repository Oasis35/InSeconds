import { TestBed } from '@angular/core/testing';
import { GITHUB_CACHE_MS, GITHUB_FETCH, GithubCiApi, ciRunsPage } from './github-ci.api';

describe('GithubCiApi', () => {
  let fetch: ReturnType<typeof vi.fn>;
  let api: GithubCiApi;

  function respond(body: unknown, ok = true) {
    fetch.mockResolvedValue({ ok, json: () => Promise.resolve(body) } as Response);
  }

  beforeEach(() => {
    fetch = vi.fn();
    TestBed.configureTestingModule({ providers: [GithubCiApi, { provide: GITHUB_FETCH, useValue: fetch }] });
    api = TestBed.inject(GithubCiApi);
  });

  afterEach(() => vi.useRealTimers());

  it('lit le dernier passage de ci.yml sur la branche, sans cookie', async () => {
    respond({ workflow_runs: [{ head_sha: 'abc123', status: 'completed', conclusion: 'success', html_url: 'https://github.com/run/1' }] });

    expect(await api.latestRun('env/staging')).toEqual({ branch: 'env/staging', headSha: 'abc123', state: 'success', url: 'https://github.com/run/1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/Oasis35/InSeconds/actions/workflows/ci.yml/runs?branch=env%2Fstaging&per_page=1');
    expect(init.credentials).toBe('omit');
  });

  it('garde la réponse deux minutes, puis relit', async () => {
    vi.useFakeTimers();
    respond({ workflow_runs: [{ head_sha: 'abc123', status: 'in_progress', conclusion: null }] });

    expect((await api.latestRun('main'))?.state).toBe('running');
    await api.latestRun('main');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(GITHUB_CACHE_MS);
    await api.latestRun('main');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('un échec (limite atteinte, réseau, aucun passage) rend null, et n\'est pas gardé', async () => {
    respond({ message: 'API rate limit exceeded' }, false);
    expect(await api.latestRun('main')).toBeNull();

    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await api.latestRun('main')).toBeNull();

    respond({ workflow_runs: [] });
    expect(await api.latestRun('main')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('sans adresse de passage, renvoie vers la liste des passages de la branche', async () => {
    respond({ workflow_runs: [{ head_sha: 'abc123', status: 'completed', conclusion: 'failure' }] });

    expect((await api.latestRun('main'))?.url).toBe(ciRunsPage('main'));
    expect(ciRunsPage('main')).toBe('https://github.com/Oasis35/InSeconds/actions/workflows/ci.yml?query=branch%3Amain');
  });
});
