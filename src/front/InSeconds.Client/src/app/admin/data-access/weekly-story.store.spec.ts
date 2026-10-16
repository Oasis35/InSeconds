import { TestBed } from '@angular/core/testing';
import { problem } from './testing/fake-catalogue-api';
import { FakeWeeklyStoryApi, fakeWeeklyStoryApi, provideWeeklyStoryApiFake, weeklyRecap } from './testing/fake-weekly-story-api';
import { WeeklyStoryStore } from './weekly-story.store';

describe('WeeklyStoryStore', () => {
  let api: FakeWeeklyStoryApi;

  function createStore(overrides: Partial<FakeWeeklyStoryApi> = {}) {
    api = fakeWeeklyStoryApi(overrides);
    TestBed.configureTestingModule({ providers: [provideWeeklyStoryApiFake(api), WeeklyStoryStore] });
    return TestBed.inject(WeeklyStoryStore);
  }

  it('démarre sur les 7 derniers jours, titre « cette semaine », repères et pourcentage affichés', () => {
    const store = createStore();

    expect(store.status()).toBe('idle');
    expect(store.periodValid()).toBe(true);
    expect(store.from() < store.to()).toBe(true);
    expect(store.title()).toBe('Cette semaine dans InSeconds 🎧');
    expect(store.showGuides()).toBe(true);
    expect(store.showPercent()).toBe(true);
  });

  it('load : lit le récap de la période choisie puis passe en « rendering »', async () => {
    const store = createStore();
    store.setFrom('2026-09-21');
    store.setTo('2026-09-27');

    const ready = store.load();
    expect(store.status()).toBe('loading');
    expect(store.busy()).toBe(true);

    expect(await ready).toBe(true);
    expect(api.getRecap).toHaveBeenCalledWith('2026-09-21', '2026-09-27');
    expect(store.status()).toBe('rendering');
    expect(store.recap()?.mostFound?.artist).toBe('Daft Punk');
  });

  it('load : pas assez de réponses → « insufficient », rien à capturer', async () => {
    const store = createStore({
      getRecap: vi.fn(async () => weeklyRecap({ status: 'insufficient', mostFound: null, mostMissed: null })),
    });

    expect(await store.load()).toBe(false);
    expect(store.status()).toBe('insufficient');
    expect(store.busy()).toBe(false);
  });

  it('load : un échec de l\'API donne « error » avec son code', async () => {
    const store = createStore({ getRecap: vi.fn(() => Promise.reject(problem(400, 'admin.invalid_period'))) });

    expect(await store.load()).toBe(false);
    expect(store.status()).toBe('error');
    expect(store.error()?.code).toBe('admin.invalid_period');
    expect(store.recap()).toBeNull();
  });

  it('une nouvelle lecture efface les images et l\'erreur précédentes', async () => {
    const store = createStore();
    await store.load();
    store.setImages([{ kind: 'found', dataUrl: 'data:image/png;base64,AA', fileName: 'a.png' }]);
    expect(store.status()).toBe('ready');

    await store.load();

    expect(store.images()).toEqual([]);
    expect(store.status()).toBe('rendering');
  });

  it('étapes de capture : rendering → ready, ou failed → error', async () => {
    const store = createStore();
    await store.load();

    store.startRendering();
    expect(store.status()).toBe('rendering');
    store.setImages([{ kind: 'missed', dataUrl: 'data:image/png;base64,AA', fileName: 'b.png' }]);
    expect(store.status()).toBe('ready');
    expect(store.busy()).toBe(false);

    store.startRendering();
    store.failRendering();
    expect(store.status()).toBe('error');
  });

  it('le titre suit le mode ; le texte libre est coupé à 50 caractères', () => {
    const store = createStore();

    store.setTitleMode('lastWeek');
    expect(store.title()).toBe('La semaine dernière dans InSeconds 🎧');

    store.setTitleMode('custom');
    store.setCustomTitle(`  ${'x'.repeat(80)}`);
    expect(store.customTitle()).toHaveLength(50);
    expect(store.title()).toBe(`${'x'.repeat(48)}`);
  });

  it('une période inversée est invalide', () => {
    const store = createStore();
    store.setFrom('2026-09-10');
    store.setTo('2026-09-01');

    expect(store.periodValid()).toBe(false);
  });
});
