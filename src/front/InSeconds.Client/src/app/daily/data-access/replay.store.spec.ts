import { TestBed } from '@angular/core/testing';
import { FakeDailyApi, REPLAY_PAGE, provideFakeDailyApi } from './testing/fake-daily-api';
import { ReplayStore } from './replay.store';

describe('ReplayStore', () => {
  function create(fake = new FakeDailyApi()) {
    TestBed.configureTestingModule({ providers: [ReplayStore, provideFakeDailyApi(fake)] });
    return { store: TestBed.inject(ReplayStore), fake };
  }

  it('lit la première page du filtre, avec les compteurs', async () => {
    const { store, fake } = create();

    await store.load('none');

    expect(fake.calls).toContain('replay none ');
    expect(store.status()).toBe('ready');
    expect(store.filter()).toBe('none');
    expect(store.days()).toHaveLength(1);
    expect([store.allCount(), store.noneCount(), store.halfCount()]).toEqual([2, 1, 1]);
  });

  it('ajoute la page suivante sans répéter un jour, puis plus rien', async () => {
    const fake = new FakeDailyApi();
    fake.replayPages = {
      '': REPLAY_PAGE({ nextBefore: '2026-11-19' }),
      '2026-11-19': REPLAY_PAGE({ days: [{ date: '2026-11-15', tracks: [] }], nextBefore: null }),
    };
    const { store } = create(fake);

    await store.load('all');
    await store.loadMore();
    await store.loadMore();

    expect(store.days().map(d => d.date)).toEqual(['2026-11-19', '2026-11-15']);
    expect(store.nextBefore()).toBeNull();
    expect(fake.calls.filter(c => c.startsWith('replay'))).toEqual(['replay all ', 'replay all 2026-11-19']);
  });

  it("passe en erreur quand la lecture échoue, et l'adresse d'un extrait est redemandée à chaque écoute", async () => {
    const fake = new FakeDailyApi();
    fake.replayPages = { '': new Error('panne') };
    const { store } = create(fake);

    await store.load('all');
    expect(store.status()).toBe('error');

    expect(await store.previewUrl('2026-11-19', 2)).toBe('https://preview/archive.mp3');
    expect(await store.previewUrl('2026-11-19', 2)).toBe('https://preview/archive.mp3');
    expect(fake.calls.filter(c => c.startsWith('archivePreview'))).toHaveLength(2);
  });
});
