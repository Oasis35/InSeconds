import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { fakePlayersApi, providePlayersApiFake } from '../../../account/data-access/testing/fake-players-api';
import { RunsApi } from '../../data-access/runs.api';
import { RunHistory, RunHistoryEntry } from '../../domain/run-history';
import { RunHistoryPage } from './run-history.page';

const run = (sessionId: number, difficulty: RunHistoryEntry['difficulty'], disc = 'runs.discs.silver'): RunHistoryEntry => ({
  sessionId, date: '2026-10-09', disc: { key: disc, stars: 0 }, score: 2980, difficulty,
});

const HISTORY = (over: Partial<RunHistory> = {}): RunHistory => ({
  month: '2026-10', previousMonth: null, nextMonth: '2026-11', playedCount: 112, averageScore: 2640, bestScore: 3420,
  runs: [run(7, 'risky', 'runs.discs.gold'), run(6, 'safe'), run(5, 'easy', 'runs.discs.bronze')], ...over,
});

describe('RunHistoryPage', () => {
  let history: ReturnType<typeof vi.fn>;

  async function render(url = '/history/setlist', result: () => Promise<RunHistory> = async () => HISTORY()) {
    history = vi.fn(result);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([{ path: 'setlist/history', component: RunHistoryPage }, { path: '**', children: [] }]),
        providePlayersApiFake(fakePlayersApi()), { provide: RunsApi, useValue: { history } },
      ],
    });
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(RunHistoryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('montre le résumé et les setlists du mois, chacune ouvrant ses morceaux', async () => {
    const { el } = await render();

    expect(history).toHaveBeenCalledWith(null);
    expect(el.querySelector('[data-testid="history-count"]')?.textContent).toBe('112');
    const rows = [...el.querySelectorAll('[data-testid="history-run"]')];
    expect(rows.map(a => a.getAttribute('href'))).toEqual(['/history/setlist/7', '/history/setlist/6', '/history/setlist/5']);
    expect(rows[0].textContent).toContain('runs.difficulty.risky');
    expect(rows[0].querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.gold');
    expect(el.querySelector('[data-testid="history-tab-setlist"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('filtre par difficulté, et le dit quand rien ne correspond', async () => {
    const { el, fixture } = await render('/history/setlist', async () => HISTORY({ runs: [run(7, 'risky')] }));

    (el.querySelector('[data-testid="history-filter-risky"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="history-run"]')).toHaveLength(1);
    expect(el.querySelector('[data-testid="history-filter-risky"]')?.getAttribute('aria-pressed')).toBe('true');

    (el.querySelector('[data-testid="history-filter-easy"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-testid="history-run"]')).toHaveLength(0);
    expect(el.querySelector('[data-testid="history-empty"]')?.textContent).toContain('ui.history.setlist.emptyFilter');
  });

  it("lit le mois de l'adresse", async () => {
    await render('/history/setlist?mois=2026-09');

    expect(history).toHaveBeenCalledWith('2026-09');
  });

  it('un mois sans setlist le dit', async () => {
    const { el } = await render('/history/setlist', async () => HISTORY({ runs: [] }));

    expect(el.querySelector('[data-testid="history-empty"]')?.textContent).toContain('ui.history.setlist.empty');
  });

  it('une lecture en échec propose de réessayer', async () => {
    const { el, fixture } = await render('/history/setlist', () => Promise.reject(new Error('panne')));

    history.mockResolvedValue(HISTORY());
    (el.querySelector('[data-testid="run-retry"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelectorAll('[data-testid="history-run"]')).toHaveLength(3);
  });
});
