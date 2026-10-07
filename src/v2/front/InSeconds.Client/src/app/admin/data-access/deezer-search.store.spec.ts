import { TestBed } from '@angular/core/testing';
import { DeezerSearchStore, SEARCH_DEBOUNCE_MS } from './deezer-search.store';
import { PoolStore } from './pool.store';
import {
  FakeCatalogueApi, deezerResult, fakeCatalogueApi, problem, provideCatalogueApiFake,
} from './testing/fake-catalogue-api';

describe('DeezerSearchStore', () => {
  let api: FakeCatalogueApi;
  let store: InstanceType<typeof DeezerSearchStore>;
  let pool: InstanceType<typeof PoolStore>;

  function setup(overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi(overrides);
    TestBed.configureTestingModule({ providers: [PoolStore, DeezerSearchStore, provideCatalogueApiFake(api)] });
    store = TestBed.inject(DeezerSearchStore);
    pool = TestBed.inject(PoolStore);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('recherche', () => {
    it('attend 300 ms après la dernière frappe avant d\'interroger Deezer', async () => {
      setup({ searchDeezer: vi.fn(async () => [deezerResult()]) });

      store.setQuery('E2E');
      store.setQuery('E2E Track');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
      expect(api.searchDeezer).not.toHaveBeenCalled();
      expect(store.searching()).toBe(true);

      await vi.advanceTimersByTimeAsync(1);

      expect(api.searchDeezer).toHaveBeenCalledTimes(1);
      expect(api.searchDeezer).toHaveBeenCalledWith('E2E Track');
      expect(store.results()).toEqual([deezerResult()]);
      expect(store.searching()).toBe(false);
    });

    it('n\'interroge pas Deezer sous 2 caractères et vide les résultats', async () => {
      setup({ searchDeezer: vi.fn(async () => [deezerResult()]) });
      store.setQuery('Em');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      expect(store.results()).toHaveLength(1);

      store.setQuery('E');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

      expect(api.searchDeezer).toHaveBeenCalledTimes(1);
      expect(store.results()).toEqual([]);
      expect(store.searching()).toBe(false);
    });

    it('une recherche plus récente annule celle en cours', async () => {
      let resolveFirst!: (results: ReturnType<typeof deezerResult>[]) => void;
      setup({
        searchDeezer: vi.fn()
          .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
          .mockResolvedValueOnce([deezerResult({ deezerTrackId: 2, title: 'Deuxième' })]),
      });

      store.setQuery('premier');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      store.setQuery('deuxième');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      resolveFirst([deezerResult({ deezerTrackId: 1, title: 'Premier' })]);
      await vi.advanceTimersByTimeAsync(0);

      expect(store.results().map(r => r.title)).toEqual(['Deuxième']);
    });

    it('garde le code d\'erreur quand Deezer est indisponible', async () => {
      setup({ searchDeezer: vi.fn(async () => Promise.reject(problem(503, 'catalogue.deezer_unavailable'))) });

      store.setQuery('Eminem');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

      expect(store.searchError()?.code).toBe('catalogue.deezer_unavailable');
      expect(store.results()).toEqual([]);
      expect(store.searching()).toBe(false);
    });
  });

  describe('panneau', () => {
    it('s\'ouvre et se ferme', () => {
      setup();

      store.toggleOpen();
      expect(store.open()).toBe(true);
      store.toggleOpen();
      expect(store.open()).toBe(false);
    });

    it('oublie la recherche, les résultats et les ajouts à la fermeture', async () => {
      setup({ searchDeezer: vi.fn(async () => [deezerResult()]) });
      store.toggleOpen();
      store.setQuery('Eminem');
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
      await store.add(42);

      store.toggleOpen();

      expect(store.query()).toBe('');
      expect(store.results()).toEqual([]);
      expect(store.addStatuses()).toEqual({});
    });

    it('une recherche en attente à la fermeture n\'écrit plus rien', async () => {
      setup({ searchDeezer: vi.fn(async () => [deezerResult()]) });
      store.toggleOpen();
      store.setQuery('Eminem');

      store.toggleOpen();
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

      expect(api.searchDeezer).not.toHaveBeenCalled();
      expect(store.results()).toEqual([]);
    });

    it('lie et délie les recherches', () => {
      setup();

      store.toggleLinked();
      expect(store.linked()).toBe(true);
      store.toggleLinked();
      expect(store.linked()).toBe(false);
    });
  });

  describe('ajout', () => {
    it('ajoute le morceau au pool, puis rend la ligne au repos', async () => {
      setup();

      const adding = store.add(42);
      expect(store.addStatuses()[42]).toBe('loading');
      await adding;

      expect(api.addTrack).toHaveBeenCalledWith(42);
      expect(api.listTracks).toHaveBeenCalled();
      expect(store.addStatuses()[42]).toBe('success');
      await vi.advanceTimersByTimeAsync(2000);
      expect(store.addStatuses()[42]).toBeUndefined();
    });

    it('garde la raison d\'un refus (doublon) pour la ligne concernée seulement', async () => {
      setup();
      api.addTrack.mockRejectedValueOnce(problem(409, 'catalogue.duplicate_deezer_id'));

      await store.add(42);
      await store.add(43);

      expect(store.addStatuses()).toEqual({ 42: 'error', 43: 'success' });
      expect(store.addErrors()[42]?.code).toBe('catalogue.duplicate_deezer_id');
      expect(store.addErrors()[43]).toBeUndefined();
      await vi.advanceTimersByTimeAsync(3000);
      expect(store.addStatuses()).toEqual({});
      expect(store.addErrors()).toEqual({});
    });

    it('partage le pool avec la page : le morceau ajouté y apparaît', async () => {
      const added = { id: 5, deezerTrackId: 42, artist: 'E2E Artist', title: 'E2E Track' };
      setup();
      api.listTracks.mockResolvedValueOnce([{
        ...added, preview: 'available', isDisabled: false, lastUsedDate: null, usageCount: 0, unlockDate: null, inTodayChallenge: false,
      }]);

      await store.add(42);

      expect(pool.tracks().map(t => t.id)).toEqual([5]);
      expect(pool.existingDeezerIds().get(42)).toBe(true);
    });
  });
});
