import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { utcDayOf } from '../../../ui/format/day-label';
import { DailyApi } from '../../data-access/daily.api';
import { DailyHistory } from '../../domain/history';
import { DailyHistoryPage } from './daily-history.page';

const TODAY = utcDayOf(new Date());

const HISTORY = (over: Partial<DailyHistory> = {}): DailyHistory => ({
  month: '2026-10', previousMonth: '2026-09', nextMonth: null, playedCount: 58, averageScore: 2050, bestScore: 3100,
  games: [
    { date: TODAY, score: 2140, tracks: [{ position: 1, artistCorrect: true, titleCorrect: true }, { position: 2, artistCorrect: true, titleCorrect: false }, { position: 3, artistCorrect: false, titleCorrect: false }] },
    { date: '2026-10-09', score: 1980, tracks: [] },
  ],
  ...over,
});

describe('DailyHistoryPage', () => {
  let history: ReturnType<typeof vi.fn>;

  async function render(url = '/history/daily', result: () => Promise<DailyHistory> = async () => HISTORY()) {
    history = vi.fn(result);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([{ path: 'history/daily', component: DailyHistoryPage }, { path: '**', children: [] }]),
        providePlayersApiFake(fakePlayersApi()), { provide: DailyApi, useValue: { history } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(DailyHistoryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lit le mois en cours sans mois dans l’adresse, et montre le résumé et les parties', async () => {
    const { el } = await render();

    expect(history).toHaveBeenCalledWith(null);
    expect(el.querySelector('[data-testid="history-count"]')?.textContent).toBe('58');
    expect(el.querySelectorAll('[data-testid="history-game"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="history-tab-daily"]')?.getAttribute('aria-current')).toBe('page');
  });

  it("la partie d'aujourd'hui mène au résultat du jour, les autres aux réponses du jour", async () => {
    const { el } = await render();
    const links = [...el.querySelectorAll('[data-testid="history-game"]')].map(a => a.getAttribute('href'));

    expect(links).toEqual(['/daily', '/history/daily/2026-10-09']);
    expect(el.querySelector('[data-testid="history-game"]')?.textContent).toContain('ui.history.today');
  });

  it('une barre par morceau : trouvé, à moitié, raté', async () => {
    const { el } = await render();
    const verdicts = [...el.querySelector('[data-testid="history-game"]')!.querySelectorAll('.bar')].map(b => b.getAttribute('data-verdict'));

    expect(verdicts).toEqual(['found', 'half', 'missed']);
  });

  it("lit le mois de l'adresse ; un mois mal écrit redevient le mois en cours", async () => {
    await render('/history/daily?mois=2026-09');
    expect(history).toHaveBeenCalledWith('2026-09');

    TestBed.resetTestingModule();
    await render('/history/daily?mois=septembre');
    expect(history).toHaveBeenCalledWith(null);
  });

  it('un mois sans partie le dit, et garde le lien des réponses des jours passés', async () => {
    const { el } = await render('/history/daily', async () => HISTORY({ games: [] }));

    expect(el.querySelector('[data-testid="history-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="history-archive"]')?.getAttribute('href')).toBe('/history/daily/latest');
  });

  it('une lecture en échec propose de réessayer', async () => {
    const { el, fixture } = await render('/history/daily', () => Promise.reject(new Error('panne')));
    expect(el.querySelector('[data-testid="history-games"]')).toBeNull();

    history.mockResolvedValue(HISTORY());
    (el.querySelector('app-status-screen button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="history-game"]')).toHaveLength(2);
  });
});
