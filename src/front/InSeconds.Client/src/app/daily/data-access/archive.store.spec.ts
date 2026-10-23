import { TestBed } from '@angular/core/testing';
import { NOBODY } from '../domain/archive';
import { ArchiveStore } from './archive.store';
import { ARCHIVE_DAY, ARCHIVE_ME, FakeDailyApi, provideFakeDailyApi } from './testing/fake-daily-api';

describe('ArchiveStore', () => {
  let api: FakeDailyApi;
  let store: InstanceType<typeof ArchiveStore>;

  beforeEach(() => {
    api = new FakeDailyApi();
    TestBed.configureTestingModule({ providers: [provideFakeDailyApi(api), ArchiveStore] });
    store = TestBed.inject(ArchiveStore);
  });

  it('lit les réponses du jour et la partie du joueur reconnu', async () => {
    api.archiveMe = ARCHIVE_ME();
    await store.load('2026-10-21');

    expect(store.status()).toBe('ready');
    expect(store.day()?.tracks).toHaveLength(3);
    expect(store.played()).toBe(true);
    expect(store.mostMissed()).toBe(3);
    expect(api.calls).toEqual(['archiveDay 2026-10-21', 'myArchiveDay 2026-10-21']);
  });

  it('un visiteur (ou une lecture de sa partie qui échoue) voit la page comme tout le monde', async () => {
    api.archiveMe = new Error('réseau');
    await store.load('2026-10-21');

    expect(store.status()).toBe('ready');
    expect(store.me()).toEqual(NOBODY);
  });

  it("un jour non publié, ou une date mal écrite (sans rien demander), n'a pas de page", async () => {
    await store.load('2026-10-22');
    expect(store.status()).toBe('not_found');

    api.calls.length = 0;
    await store.load('2026-02-31');
    expect(store.status()).toBe('not_found');
    expect(api.calls).toEqual([]);
  });

  it('une panne affiche l erreur, sans données', async () => {
    api.archiveDays = { '2026-10-21': new Error('500') };
    await store.load('2026-10-21');
    expect(store.status()).toBe('error');
    expect(store.day()).toBeNull();
  });

  it('lit les jours publiés une seule fois (calendrier)', async () => {
    expect(await store.loadDates()).toEqual(['2026-10-21', '2026-10-20']);
    await store.loadDates();
    expect(api.calls.filter(c => c === 'archiveDates')).toHaveLength(1);
  });

  it("ignore une réponse arrivée après qu'on a changé de jour", async () => {
    api.archiveDays['2026-10-20'] = ARCHIVE_DAY({ date: '2026-10-20' });
    const first = store.load('2026-10-21');
    const second = store.load('2026-10-20');
    await Promise.all([first, second]);
    expect(store.day()?.date).toBe('2026-10-20');
  });
});
