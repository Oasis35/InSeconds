import { TestBed } from '@angular/core/testing';
import { RunHistory, RunHistoryEntry } from '../domain/run-history';
import { RunHistoryStore } from './run-history.store';
import { RunsApi } from './runs.api';

const run = (sessionId: number): RunHistoryEntry => ({
  sessionId, date: '2026-11-10', challengeCode: 'ABC234', status: 'lost', roundsPassed: 2, score: 2000,
});
const HISTORY = (month: string): RunHistory => ({
  month, previousMonth: null, nextMonth: null, playedCount: 2, averageScore: 2000, bestScore: 2000, runs: [run(1), run(2)],
});

describe('RunHistoryStore', () => {
  function create(history: (month: string | null) => Promise<RunHistory>) {
    TestBed.configureTestingModule({ providers: [RunHistoryStore, { provide: RunsApi, useValue: { history } }] });
    return TestBed.inject(RunHistoryStore);
  }

  it('lit le mois demandé', async () => {
    const store = create(async month => HISTORY(month ?? '2026-11'));

    await store.load('2026-10');

    expect(store.status()).toBe('ready');
    expect(store.history()?.month).toBe('2026-10');
    expect(store.history()?.runs).toHaveLength(2);
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
