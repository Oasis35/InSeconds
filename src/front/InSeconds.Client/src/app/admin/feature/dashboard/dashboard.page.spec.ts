import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../../core/clipboard/clipboard.service';
import { WIDE_SCREEN } from '../../../core/layout/wide-screen';
import { ModalService } from '../../../ui/modal/modal.service';
import { DashboardStore } from '../../data-access/dashboard.store';
import {
  FakeChallengesApi, challengePlayer, challengeStats, challengeTrack, fakeChallengesApi, provideChallengesApiFake, statsPage,
} from '../../data-access/testing/fake-challenges-api';
import {
  FakeDashboardApi, dashboard, fakeDashboardApi, provideDashboardApiFake,
} from '../../data-access/testing/fake-dashboard-api';
import { Dashboard } from '../../domain/dashboard';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  let api: FakeDashboardApi;
  let challenges: FakeChallengesApi;
  let router: { navigate: ReturnType<typeof vi.fn> };

  const october5 = challengeStats({
    id: 5, date: '2026-10-05',
    players: [challengePlayer({ playerId: 'p1', pseudo: 'Alice' }), challengePlayer({ playerId: 'p2', pseudo: null })],
    tracks: [challengeTrack({ position: 1, artist: 'Eminem', title: 'Lose Yourself' })],
  });

  async function render(options: { api?: Partial<FakeDashboardApi>; wide?: boolean; query?: Record<string, string> } = {}) {
    api = fakeDashboardApi(options.api);
    challenges = fakeChallengesApi({ loadStats: vi.fn(async () => statsPage([october5])) });
    router = { navigate: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideDashboardApiFake(api),
        provideChallengesApiFake(challenges),
        { provide: ClipboardService, useValue: { copy: vi.fn(async () => true) } },
        { provide: ModalService, useValue: { open: vi.fn() } },
        { provide: WIDE_SCREEN, useValue: signal(options.wide ?? false) },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) } } },
      ],
    });
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
  const byTestId = (element: HTMLElement, id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('charge le tableau de bord et les défis à l\'ouverture, une seule fois, sans jour', async () => {
    await render();

    expect(api.getDashboard).toHaveBeenCalledTimes(1);
    expect(api.getDashboard).toHaveBeenCalledWith(undefined);
    expect(challenges.loadStats).toHaveBeenCalledTimes(1);
  });

  it('la carte du jour : le jour, les trois tuiles et la ligne secondaire', async () => {
    const { element } = await render();

    expect(byTestId(element, 'dashboard-selected-day')?.textContent).toContain('lundi 5 octobre');
    expect(byTestId(element, 'kpi-completed')?.textContent).toContain('4');
    expect(byTestId(element, 'kpi-new')?.textContent).toContain('2');
    expect(byTestId(element, 'kpi-median')?.textContent).toContain('4,200');
    const details = byTestId(element, 'kpi-details')?.textContent ?? '';
    expect(details).toContain('admin.dashboard.expired');
    expect(details).toContain('admin.dashboard.completionRate');
    expect(details).toContain('admin.dashboard.accountCreated');
  });

  it('les joueurs du jour sous les chiffres, puis l\'activité et les totaux', async () => {
    const { element } = await render();

    expect(byTestId(element, 'day-players')?.textContent).toContain('Alice');
    expect(element.querySelectorAll('[data-testid="dashboard-activity-bar"]')).toHaveLength(2);
    expect(byTestId(element, 'dashboard-totals')?.textContent).toContain('13');
  });

  it('téléphone : les morceaux du jour sont repliés sous la carte, et se déplient', async () => {
    const { element, detect } = await render();
    expect(byTestId(element, 'day-tracks')).toBeNull();

    buttons(element).find(b => b.textContent?.includes('admin.dashboard.dayTracks'))!.click();
    await detect();

    expect(byTestId(element, 'day-card')?.querySelector('[data-testid="day-tracks"]')?.textContent).toContain('Eminem');
  });

  it('PC : les morceaux du jour dépliés dans la colonne de droite', async () => {
    const { element } = await render({ wide: true });

    expect(byTestId(element, 'day-card')?.querySelector('[data-testid="day-tracks"]')).toBeNull();
    expect(byTestId(element, 'day-tracks')?.textContent).toContain('Eminem');
  });

  it('un jour sans défi affiche le message à la place des chiffres', async () => {
    const { element } = await render({ api: { getDashboard: vi.fn(async () => dashboard({ kpis: null })) } });

    expect(element.textContent).toContain('admin.dashboard.noChallengeForDay');
    expect(byTestId(element, 'kpi-completed')).toBeNull();
  });

  it('le jour vit dans l\'adresse : ?jour= est lu au chargement, et le jour affiché y est écrit', async () => {
    await render({ query: { jour: '2026-10-04' } });

    expect(api.getDashboard).toHaveBeenCalledWith('2026-10-04');
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { jour: '2026-10-04' }, replaceUrl: true }));
  });

  it('un ?jour= mal formé est ignoré', async () => {
    await render({ query: { jour: 'hier' } });

    expect(api.getDashboard).toHaveBeenCalledWith(undefined);
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
