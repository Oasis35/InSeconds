import { TestBed } from '@angular/core/testing';
import { DailyHistory } from '../domain/history';
import { DailyApi } from './daily.api';
import { DailyHistoryStore } from './daily-history.store';

const HISTORY = (month: string): DailyHistory => ({ month, previousMonth: null, nextMonth: null, playedCount: 1, averageScore: 2000, bestScore: 2000, games: [] });

describe('DailyHistoryStore', () => {
  function create(history: (month: string | null) => Promise<DailyHistory>) {
    TestBed.configureTestingModule({ providers: [DailyHistoryStore, { provide: DailyApi, useValue: { history } }] });
    return TestBed.inject(DailyHistoryStore);
  }

  it('lit le mois demandé', async () => {
    const history = vi.fn(async (month: string | null) => HISTORY(month ?? '2026-11'));
    const store = create(history);

    await store.load('2026-10');

    expect(history).toHaveBeenCalledWith('2026-10');
    expect(store.status()).toBe('ready');
    expect(store.history()?.month).toBe('2026-10');
  });

  it('passe en erreur quand la lecture échoue', async () => {
    const store = create(() => Promise.reject(new Error('panne')));

    await store.load(null);

    expect(store.status()).toBe('error');
  });

  it("ignore la réponse d'un mois quitté entre-temps", async () => {
    let resolveFirst!: (history: DailyHistory) => void;
    const first = new Promise<DailyHistory>(resolve => (resolveFirst = resolve));
    const store = create(month => (month === '2026-09' ? first : Promise.resolve(HISTORY('2026-10'))));

    const slow = store.load('2026-09');
    await store.load('2026-10');
    resolveFirst(HISTORY('2026-09'));
    await slow;

    expect(store.history()?.month).toBe('2026-10');
  });
});
