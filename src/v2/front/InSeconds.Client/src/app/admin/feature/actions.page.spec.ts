import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { JobLastRun } from '../domain/job';
import { JOBS_DASHBOARD_URL } from '../data-access/admin-api.providers';
import { FakeActionsApi, fakeActionsApi, provideActionsApiFake } from '../data-access/testing/fake-actions-api';
import { problem } from '../data-access/testing/fake-catalogue-api';
import { FakeJobsApi, fakeJobsApi, provideJobsApiFake } from '../data-access/testing/fake-jobs-api';
import { ActionsPage } from './actions.page';

function lastRun(id: string, overrides: Partial<JobLastRun> = {}): JobLastRun {
  return {
    id, state: 'succeeded', at: '2026-10-09T00:00:03Z', result: null, errorCode: null, retryAt: null,
    nextRunAt: '2026-10-10T00:00:00Z', ...overrides,
  };
}

describe('ActionsPage', () => {
  let api: FakeActionsApi;
  let jobs: FakeJobsApi;

  async function render(overrides: Partial<FakeActionsApi> = {}, jobOverrides: Partial<FakeJobsApi> = {}) {
    api = fakeActionsApi(overrides);
    jobs = fakeJobsApi(jobOverrides);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideActionsApiFake(api),
        provideJobsApiFake(jobs),
        { provide: JOBS_DASHBOARD_URL, useValue: 'https://api.test/jobs' },
      ],
    });
    const fixture = TestBed.createComponent(ActionsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (key: string) =>
      Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(key)) as HTMLButtonElement;
    const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };
    const witness = (testId: string) => element.querySelector(`[data-testid="${testId}"]`)?.textContent ?? '';
    return { fixture, element, button, settle, witness };
  }

  it('lit le délai à l\'ouverture et le met dans le champ', async () => {
    const { element } = await render({ getCooldownDays: vi.fn(() => Promise.resolve(45)) });
    const input = element.querySelector('#track-cooldown-days-input') as HTMLInputElement;
    expect(input.value).toBe('45');
    expect(element.querySelector('label[for="track-cooldown-days-input"]')?.textContent).toContain('admin.actions.trackCooldown');
  });

  it('témoins du dernier passage des deux tâches, sans bouton pour les lancer', async () => {
    const { element, button, witness } = await render({}, {
      getLastRuns: vi.fn(() => Promise.resolve([
        lastRun('daily-generate-challenge', { result: { created: true } }),
        lastRun('catalogue-refresh', { result: { checked: 12, updated: 3, failed: 2 } }),
        lastRun('players-purge-expired-tokens'),
      ])),
    });

    expect(witness('challenge-witness')).toContain('admin.actions.challengeOfDay');
    expect(witness('challenge-witness')).toContain('admin.actions.witness.challengeCreated');
    expect(witness('challenge-witness')).toContain('admin.actions.witness.next');
    expect(witness('previews-witness')).toContain('⚠️');
    expect(witness('previews-witness')).toContain('admin.actions.witness.previewsReport');
    expect(element.querySelectorAll('[data-testid$="-witness"] button')).toHaveLength(0);
    expect(button('admin.actions.generate')).toBeUndefined();
    expect(button('admin.actions.refreshPreviews')).toBeUndefined();
  });

  it('pool insuffisant : à surveiller, avec le prochain essai', async () => {
    const { witness } = await render({}, {
      getLastRuns: vi.fn(() => Promise.resolve([
        lastRun('daily-generate-challenge', { state: 'retry_scheduled', errorCode: 'admin.pool_insufficient', retryAt: '2026-10-09T00:10:03Z' }),
      ])),
    });

    expect(witness('challenge-witness')).toContain('admin.actions.witness.poolInsufficient');
    expect(witness('challenge-witness')).toContain('admin.actions.witness.retry');
    expect(witness('previews-witness')).toContain('admin.actions.witness.never');
  });

  it('derniers passages illisibles : les témoins le disent, le reste de l\'onglet fonctionne', async () => {
    const { element, witness } = await render({}, { getLastRuns: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });

    expect(witness('challenge-witness')).toContain('admin.actions.witness.loadError');
    expect(witness('previews-witness')).toContain('admin.actions.witness.loadError');
    expect((element.querySelector('#track-cooldown-days-input') as HTMLInputElement).value).toBe('30');
  });

  it('enregistre le délai saisi', async () => {
    const { element, button, settle } = await render();
    const input = element.querySelector('#track-cooldown-days-input') as HTMLInputElement;
    input.value = '45';
    input.dispatchEvent(new Event('input'));
    await settle();
    button('admin.actions.saveCooldown').click();
    await settle();
    expect(api.updateCooldownDays).toHaveBeenCalledWith(45);
    expect(element.textContent).toContain('admin.actions.cooldownSaved');
  });

  it('refuse un délai hors bornes', async () => {
    const { element, button, settle } = await render();
    const input = element.querySelector('#track-cooldown-days-input') as HTMLInputElement;
    input.value = '5000';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(button('admin.actions.saveCooldown').disabled).toBe(true);
    expect(api.updateCooldownDays).not.toHaveBeenCalled();
  });

  it('lien vers le tableau de bord des tâches, dans un nouvel onglet', async () => {
    const { element } = await render();
    const link = element.querySelector('a[data-testid="jobs-dashboard-link"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://api.test/jobs');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('inclut les stories hebdo en fin de page', async () => {
    const { element } = await render();
    expect(element.querySelector('app-weekly-story')).not.toBeNull();
  });
});
