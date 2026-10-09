import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { JobStatus } from '../domain/job';
import { JOBS_DASHBOARD_URL } from '../data-access/admin-api.providers';
import { JobRunner } from '../data-access/job-runner';
import { FakeActionsApi, fakeActionsApi, provideActionsApiFake } from '../data-access/testing/fake-actions-api';
import { fakeCatalogueApi, provideCatalogueApiFake } from '../data-access/testing/fake-catalogue-api';
import { ActionsPage } from './actions.page';

describe('ActionsPage', () => {
  let api: FakeActionsApi;
  let runner: { follow: ReturnType<typeof vi.fn> };

  async function render(overrides: Partial<FakeActionsApi> = {}) {
    api = fakeActionsApi(overrides);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideActionsApiFake(api),
        provideCatalogueApiFake(fakeCatalogueApi()),
        { provide: JobRunner, useValue: runner },
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
    return { fixture, element, button, settle };
  }

  beforeEach(() => {
    runner = { follow: vi.fn(async (): Promise<JobStatus> => ({ id: '1', state: 'succeeded', result: { created: true }, errorCode: null })) };
  });

  it('lit le délai à l\'ouverture et le met dans le champ', async () => {
    const { element } = await render({ getCooldownDays: vi.fn(() => Promise.resolve(45)) });
    const input = element.querySelector('#track-cooldown-days-input') as HTMLInputElement;
    expect(input.value).toBe('45');
    expect(element.querySelector('label[for="track-cooldown-days-input"]')?.textContent).toContain('admin.actions.trackCooldown');
  });

  it('génère le défi du jour et affiche le résultat', async () => {
    const { element, button, settle } = await render();
    button('admin.actions.generate').click();
    await settle();
    expect(api.generateToday).toHaveBeenCalledTimes(1);
    expect(element.textContent).toContain('admin.actions.generated');
  });

  it('affiche « déjà généré » quand le défi existe', async () => {
    runner.follow.mockResolvedValue({ id: '1', state: 'succeeded', result: { created: false }, errorCode: null });
    const { element, button, settle } = await render();
    button('admin.actions.generate').click();
    await settle();
    expect(element.textContent).toContain('admin.actions.alreadyGenerated');
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
