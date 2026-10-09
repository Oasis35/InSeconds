import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DashboardStore } from '../data-access/dashboard.store';
import {
  FakeDashboardApi, dashboard, fakeDashboardApi, provideDashboardApiFake,
} from '../data-access/testing/fake-dashboard-api';
import { Dashboard } from '../domain/dashboard';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  let api: FakeDashboardApi;

  async function render(options: { api?: Partial<FakeDashboardApi> } = {}) {
    api = fakeDashboardApi(options.api);
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideDashboardApiFake(api)] });
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const detect = async () => {
      await fixture.whenStable();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    return { fixture, element, detect, store: fixture.debugElement.injector.get(DashboardStore) };
  }

  const buttons = (element: HTMLElement) => Array.from(element.querySelectorAll('button'));

  it('charge le tableau de bord à l\'ouverture, une seule fois, sans jour', async () => {
    await render();

    expect(api.getDashboard).toHaveBeenCalledTimes(1);
    expect(api.getDashboard).toHaveBeenCalledWith(undefined);
  });

  it('affiche le jour, les KPI, l\'activité et les joueurs', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="dashboard-selected-day"]')?.textContent).toContain('lundi 5 octobre');
    const text = element.textContent ?? '';
    expect(text).toContain('admin.dashboard.kpiCompleted');
    expect(text).toContain('66.7%');
    expect(text).toContain('4,200');
    expect(element.querySelectorAll('[data-testid="dashboard-activity-bar"]')).toHaveLength(2);
    expect(text).toContain('admin.dashboard.playersTitle');
  });

  it('un jour sans défi affiche le message à la place des KPI', async () => {
    const { element } = await render({ api: { getDashboard: vi.fn(async () => dashboard({ kpis: null })) } });

    expect(element.textContent).toContain('admin.dashboard.noChallengeForDay');
    expect(element.textContent).not.toContain('admin.dashboard.kpiCompleted');
  });

  it('la flèche « précédent » relit le jour précédent', async () => {
    const { element, detect } = await render();

    buttons(element).find(b => b.textContent?.trim() === '‹')!.click();
    await detect();

    expect(api.getDashboard).toHaveBeenLastCalledWith('2026-10-04');
  });

  it('un clic sur une barre sélectionne ce jour', async () => {
    const { element, detect } = await render();

    (element.querySelectorAll('[data-testid="dashboard-activity-bar"]')[0] as HTMLButtonElement).click();
    await detect();

    expect(api.getDashboard).toHaveBeenLastCalledWith('2026-10-04');
  });

  it('sans activité sur la période, le graphique est remplacé par un message', async () => {
    const empty: Dashboard = dashboard({ activity: [{ day: '2026-10-05', playerCount: 0 }] });
    const { element } = await render({ api: { getDashboard: vi.fn(async () => empty) } });

    expect(element.textContent).toContain('admin.dashboard.noCompletedInPeriod');
    expect(element.querySelector('[data-testid="dashboard-activity-bar"]')).toBeNull();
  });

  it('affiche l\'erreur de chargement avec son code', async () => {
    const { element } = await render({
      api: { getDashboard: vi.fn(() => Promise.reject({ status: 500, code: 'common.unexpected', traceId: 'trace-1' })) },
    });

    expect(element.querySelector('app-error-message')?.textContent).toContain('errors.common.unexpected');
    expect(element.querySelector('app-error-message')?.textContent).toContain('trace-1');
  });
});
