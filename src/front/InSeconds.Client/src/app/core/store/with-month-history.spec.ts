import { TestBed } from '@angular/core/testing';
import { signalStore } from '@ngrx/signals';
import { withMonthHistory } from './with-month-history';

interface Month {
  month: string;
}

describe('withMonthHistory', () => {
  function create(read: (month: string | null) => Promise<Month>) {
    const TestStore = signalStore(withMonthHistory<Month>(() => read));
    TestBed.configureTestingModule({ providers: [TestStore] });
    return TestBed.inject(TestStore);
  }

  it('part en chargement, sans historique', () => {
    const store = create(() => Promise.resolve({ month: '2026-11' }));

    expect(store.status()).toBe('loading');
    expect(store.history()).toBeNull();
  });

  it('lit le mois demandé', async () => {
    const read = vi.fn(async (month: string | null) => ({ month: month ?? '2026-11' }));
    const store = create(read);

    await store.load('2026-10');

    expect(read).toHaveBeenCalledWith('2026-10');
    expect(store.status()).toBe('ready');
    expect(store.history()?.month).toBe('2026-10');
  });

  it('passe en erreur quand la lecture échoue', async () => {
    const store = create(() => Promise.reject(new Error('panne')));

    await store.load(null);

    expect(store.status()).toBe('error');
  });

  it("ignore la réponse d'un mois quitté entre-temps", async () => {
    let resolveFirst!: (history: Month) => void;
    const first = new Promise<Month>(resolve => (resolveFirst = resolve));
    const store = create(month => (month === '2026-09' ? first : Promise.resolve({ month: '2026-10' })));

    const slow = store.load('2026-09');
    await store.load('2026-10');
    resolveFirst({ month: '2026-09' });
    await slow;

    expect(store.history()?.month).toBe('2026-10');
  });

  it("ignore l'échec d'un mois quitté entre-temps", async () => {
    let rejectFirst!: (error: Error) => void;
    const first = new Promise<Month>((_, reject) => (rejectFirst = reject));
    const store = create(month => (month === '2026-09' ? first : Promise.resolve({ month: '2026-10' })));

    const slow = store.load('2026-09');
    await store.load('2026-10');
    rejectFirst(new Error('panne tardive'));
    await slow;

    expect(store.status()).toBe('ready');
    expect(store.history()?.month).toBe('2026-10');
  });
});
