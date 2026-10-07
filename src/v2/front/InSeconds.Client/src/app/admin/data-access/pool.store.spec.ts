import { TestBed } from '@angular/core/testing';
import { PoolTrack } from '../domain/pool-track';
import { PoolStore } from './pool.store';
import { FakeCatalogueApi, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake } from './testing/fake-catalogue-api';

describe('PoolStore', () => {
  const eminem = poolTrack({ id: 1, deezerTrackId: 11, artist: 'Eminem', title: 'Lose Yourself', usageCount: 1, lastUsedDate: '2026-10-07', inTodayChallenge: true });
  const coldplay = poolTrack({ id: 2, deezerTrackId: 12, artist: 'Coldplay', title: 'Yellow', usageCount: 1, lastUsedDate: '2026-10-05' });
  const sabrina = poolTrack({ id: 3, deezerTrackId: 13, artist: 'Sabrina Carpenter', title: 'Espresso' });
  const beatles = poolTrack({ id: 4, deezerTrackId: 14, artist: 'The Beatles', title: 'Come Together', preview: 'missing' });

  let api: FakeCatalogueApi;
  let store: InstanceType<typeof PoolStore>;

  async function setup(tracks: PoolTrack[] = [eminem, coldplay, sabrina, beatles], overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi({ listTracks: vi.fn(async () => tracks), ...overrides });
    TestBed.configureTestingModule({ providers: [PoolStore, provideCatalogueApiFake(api)] });
    store = TestBed.inject(PoolStore);
    await store.load();
  }

  describe('chargement', () => {
    it('charge le pool et compte disponibles, utilisés et désactivés', async () => {
      await setup([eminem, coldplay, sabrina, poolTrack({ id: 9, isDisabled: true })]);

      expect(store.isFulfilled()).toBe(true);
      expect(store.tracks()).toHaveLength(4);
      expect(store.availableCount()).toBe(2);
      expect(store.usedCount()).toBe(2);
      expect(store.disabledCount()).toBe(1);
    });

    it('une lecture plus ancienne, arrivée après une plus récente, n\'écrit rien', async () => {
      await setup([eminem]);
      let answerOld!: (tracks: PoolTrack[]) => void;
      api.listTracks
        .mockReturnValueOnce(new Promise<PoolTrack[]>(resolve => { answerOld = resolve; }))
        .mockResolvedValueOnce([eminem, sabrina]);

      const old = store.load();
      await store.load();
      answerOld([eminem]);
      await old;

      expect(store.tracks().map(t => t.id)).toEqual([1, 3]);
    });

    it('garde le code d\'erreur quand le chargement échoue', async () => {
      await setup([], { listTracks: vi.fn(async () => Promise.reject(problem(401, 'common.unauthorized'))) });

      expect(store.error()?.code).toBe('common.unauthorized');
      expect(store.tracks()).toEqual([]);
    });

    it('calcule l\'autonomie : morceaux tirables ÷ morceaux par défi', async () => {
      const tracks = Array.from({ length: 12 }, (_, i) => poolTrack({ id: i + 1, deezerTrackId: i + 100 }));
      await setup(tracks);

      expect(store.runwayDays()).toBe(2);
      expect(store.runwayTone()).toBe('low');
    });
  });

  describe('filtres et pagination', () => {
    it('filtre sur « artiste titre » collés et revient à la première page', async () => {
      const many = Array.from({ length: 40 }, (_, i) => poolTrack({ id: i + 1, deezerTrackId: i + 100, artist: `Artiste ${i}`, title: `Titre ${i}` }));
      await setup([...many, poolTrack({ id: 99, deezerTrackId: 999, artist: 'Nicki Minaj', title: 'Starships' })]);
      store.goToPage(2);

      store.setText('nicki minaj starships');

      expect(store.filtered().map(t => t.id)).toEqual([99]);
      expect(store.page()).toBe(0);
    });

    it('découpe en pages de 15 et ramène une page trop grande dans les bornes', async () => {
      await setup(Array.from({ length: 31 }, (_, i) => poolTrack({ id: i + 1, deezerTrackId: i + 100 })));

      expect(store.pages()).toBe(3);
      expect(store.pageTracks()).toHaveLength(15);
      store.goToPage(2);
      expect(store.pageTracks()).toHaveLength(1);
      store.goToPage(9);
      expect(store.page()).toBe(2);
      store.nextPage();
      expect(store.page()).toBe(2);
      store.previousPage();
      expect(store.page()).toBe(1);
    });

    it('trie, et change de sens au second clic sur la même colonne', async () => {
      await setup();

      store.sortBy('usageCount');
      store.sortBy('usageCount');

      expect(store.pageTracks()[0].usageCount).toBe(1);
      expect(store.sort()).toEqual({ column: 'usageCount', direction: 'desc' });
    });

    it('réinitialise tous les filtres', async () => {
      await setup();
      store.setText('x');
      store.setStatus('used');
      store.setPreview('missing');

      store.resetFilters();

      expect(store.filtered()).toHaveLength(4);
    });

    it('donne les identifiants Deezer déjà en pool, disponibles ou utilisés', async () => {
      await setup();

      expect(store.existingDeezerIds().get(13)).toBe(true);
      expect(store.existingDeezerIds().get(11)).toBe(false);
      expect(store.existingDeezerIds().has(5)).toBe(false);
    });
  });

  describe('sélection', () => {
    it('sélectionne et désélectionne', async () => {
      await setup();

      store.toggleSelection(3);
      store.toggleSelection(4);
      store.toggleSelection(3);

      expect(store.selectedIds()).toEqual([4]);
      store.clearSelection();
      expect(store.selectedIds()).toEqual([]);
    });

    it('sait qu\'un morceau utilisé est sélectionné (suppression impossible)', async () => {
      await setup();

      store.toggleSelection(3);
      expect(store.selectionHasUsedTrack()).toBe(false);
      store.toggleSelection(2);
      expect(store.selectionHasUsedTrack()).toBe(true);
    });

    it('oublie la sélection d\'un morceau qui n\'existe plus après un rechargement', async () => {
      await setup();
      store.toggleSelection(3);
      api.listTracks.mockResolvedValueOnce([eminem]);

      await store.load();

      expect(store.selectedIds()).toEqual([]);
    });
  });

  describe('ajout, renommage', () => {
    it('ajoute un morceau puis relit le pool', async () => {
      await setup();

      expect(await store.add(42)).toBeNull();

      expect(api.addTrack).toHaveBeenCalledWith(42);
      expect(api.listTracks).toHaveBeenCalledTimes(2);
    });

    it('rend l\'erreur d\'un ajout refusé, sans relire le pool', async () => {
      await setup();
      api.addTrack.mockRejectedValueOnce(problem(409, 'catalogue.duplicate_deezer_id'));

      const error = await store.add(42);

      expect(error?.code).toBe('catalogue.duplicate_deezer_id');
      expect(api.listTracks).toHaveBeenCalledTimes(1);
    });

    it('renomme sans les espaces autour, défi du jour compris', async () => {
      await setup();

      expect(await store.rename(1, '  Eminem ', ' Titre corrigé  ')).toBeNull();

      expect(api.renameTrack).toHaveBeenCalledWith(1, 'Eminem', 'Titre corrigé');
      expect(api.listTracks).toHaveBeenCalledTimes(2);
    });

    it('rend l\'erreur d\'un renommage refusé', async () => {
      await setup();
      api.renameTrack.mockRejectedValueOnce(problem(404, 'common.not_found'));

      expect((await store.rename(1, 'A', 'B'))?.code).toBe('common.not_found');
    });
  });

  describe('désactivation', () => {
    it('désactive un morceau utilisé puis relit le pool', async () => {
      await setup();

      await store.toggleDisabled(coldplay);

      expect(api.setTrackDisabled).toHaveBeenCalledWith(2, true);
      expect(api.listTracks).toHaveBeenCalledTimes(2);
      expect(store.togglingIds()).toEqual([]);
      expect(store.toggleError()).toBeNull();
    });

    it('réactive un morceau désactivé', async () => {
      const disabled = poolTrack({ id: 7, isDisabled: true, usageCount: 2 });
      await setup([disabled]);

      await store.toggleDisabled(disabled);

      expect(api.setTrackDisabled).toHaveBeenCalledWith(7, false);
    });

    it('ne désactive pas un morceau du défi du jour, sans appeler l\'API', async () => {
      await setup();

      await store.toggleDisabled(eminem);

      expect(api.setTrackDisabled).not.toHaveBeenCalled();
    });

    it('réactive pourtant un morceau du défi du jour', async () => {
      const today = poolTrack({ id: 8, isDisabled: true, inTodayChallenge: true, usageCount: 1 });
      await setup([today]);

      await store.toggleDisabled(today);

      expect(api.setTrackDisabled).toHaveBeenCalledWith(8, false);
    });

    it('ne lance pas deux requêtes pour le même morceau', async () => {
      await setup();
      let release!: () => void;
      api.setTrackDisabled.mockReturnValueOnce(new Promise<void>(resolve => { release = resolve; }));

      const first = store.toggleDisabled(coldplay);
      expect(store.togglingIds()).toEqual([2]);
      await store.toggleDisabled(coldplay);
      release();
      await first;

      expect(api.setTrackDisabled).toHaveBeenCalledTimes(1);
    });

    it('signale un refus parce que le morceau est dans le défi du jour', async () => {
      await setup();
      api.setTrackDisabled.mockRejectedValueOnce(problem(409, 'catalogue.track_in_today_challenge'));

      await store.toggleDisabled(coldplay);

      expect(store.toggleError()).toBe('inToday');
      store.dismissToggleError();
      expect(store.toggleError()).toBeNull();
    });

    it('signale toute autre erreur', async () => {
      await setup();
      api.setTrackDisabled.mockRejectedValueOnce(problem(500, 'common.unexpected'));

      await store.toggleDisabled(coldplay);

      expect(store.toggleError()).toBe('error');
      expect(store.togglingIds()).toEqual([]);
    });
  });

  describe('suppression', () => {
    it('supprime les morceaux, les retire de la sélection et revient à la première page', async () => {
      await setup();
      store.toggleSelection(3);
      store.toggleSelection(4);
      api.listTracks.mockResolvedValueOnce([eminem, coldplay]);

      expect(await store.remove([3, 4])).toBeNull();

      expect(api.deleteTrack.mock.calls.map(([id]) => id)).toEqual([3, 4]);
      expect(store.selectedIds()).toEqual([]);
      expect(store.tracks()).toHaveLength(2);
      expect(store.page()).toBe(0);
    });

    it('s\'arrête à la première erreur et relit quand même le pool', async () => {
      await setup();
      api.deleteTrack.mockResolvedValueOnce().mockRejectedValueOnce(problem(409, 'catalogue.track_in_use'));

      const error = await store.remove([3, 4]);

      expect(error?.code).toBe('catalogue.track_in_use');
      expect(api.deleteTrack).toHaveBeenCalledTimes(2);
      expect(api.listTracks).toHaveBeenCalledTimes(2);
    });

    it('considère déjà supprimé un morceau introuvable : relancer une suppression groupée interrompue aboutit', async () => {
      await setup();
      api.deleteTrack
        .mockRejectedValueOnce(problem(404, 'common.not_found'))
        .mockResolvedValueOnce();

      expect(await store.remove([3, 4])).toBeNull();

      expect(api.deleteTrack).toHaveBeenCalledTimes(2);
    });

    it('rend les morceaux sélectionnés dans l\'ordre du pool', async () => {
      await setup();
      store.toggleSelection(4);
      store.toggleSelection(3);

      expect(store.selectedTracks().map(t => t.id)).toEqual([3, 4]);
    });
  });
});
