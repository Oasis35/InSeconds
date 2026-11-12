import { TestBed } from '@angular/core/testing';
import { RunHistory, RunHistoryEntry } from '../domain/run-history';
import { RunHistoryStore } from './run-history.store';
import { RunsApi } from './runs.api';

const run = (sessionId: number, difficulty: RunHistoryEntry['difficulty']): RunHistoryEntry => ({
  sessionId, date: '2026-11-10', disc: { key: 'runs.discs.gold', stars: 0 }, score: 2000, difficulty,
});
const HISTORY = (month: string): RunHistory => ({
  month, previousMonth: null, nextMonth: null, playedCount: 2, averageScore: 2000, bestScore: 2000, runs: [run(1, 'easy'), run(2, 'risky')],
});

describe('RunHistoryStore', () => {
  function create(history: (month: string | null) => Promise<RunHistory>) {
    TestBed.configureTestingModule({ providers: [RunHistoryStore, { provide: RunsApi, useValue: { history } }] });
    return TestBed.inject(RunHistoryStore);
  }

  it('lit le mois demandé et montre tout', async () => {
    const store = create(async month => HISTORY(month ?? '2026-11'));

    await store.load('2026-10');

    expect(store.status()).toBe('ready');
    expect(store.history()?.month).toBe('2026-10');
    expect(store.visibleRuns()).toHaveLength(2);
  });

  it('filtre par difficulté', async () => {
    const store = create(async () => HISTORY('2026-11'));
    await store.load(null);

    store.chooseFilter('risky');

    expect(store.visibleRuns().map(r => r.sessionId)).toEqual([2]);
  });

  it('passe en erreur quand la lecture échoue', async () => {
    const store = create(() => Promise.reject(new Error('panne')));

    await store.load(null);

    expect(store.status()).toBe('error');
  });

  it("ignore la réponse d'un mois quitté entre-temps", async () => {
    let resolveFirst!: (history: RunHistory) => void;
    const first = new Promise<RunHistory>(resolve => (resolveFirst = resolve));
    const store = create(month => (month === '2026-09' ? first : Promise.resolve(HISTORY('2026-10'))));

    const slow = store.load('2026-09');
    await store.load('2026-10');
    resolveFirst(HISTORY('2026-09'));
    await slow;

    expect(store.history()?.month).toBe('2026-10');
  });
});
