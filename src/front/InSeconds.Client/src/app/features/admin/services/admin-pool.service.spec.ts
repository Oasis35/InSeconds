import type { Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AdminPoolService } from './admin-pool.service';
import { AdminApiService } from './admin-api.service';
import { PoolAudioPreviewService } from './pool-audio-preview.service';
import { SettingsService } from '../../../core/services/settings.service';
import { DeezerTrackInfo, PoolTracksResponse } from '../admin.models';

/** Stub minimal d'AdminApiService : uniquement les signals/méthodes consommés par AdminPoolService. */
function makeAdminApiStub() {
  const poolTracks = signal<PoolTracksResponse>({ available: [], used: [] });
  const poolSearchQuery = signal('');

  return {
    poolTracks: computed(() => poolTracks()),
    poolTracksLoading: computed(() => false),
    poolTracksLoaded: computed(() => true),
    poolSearchResults: computed(() => []),
    poolSearchLoading: computed(() => false),
    poolSearchQuery,
    setPoolSearchQuery: (q: string) => poolSearchQuery.set(q),
    addTrack: vi.fn().mockName('addTrack').mockReturnValue(of(void 0)),
    reloadPool: vi.fn().mockName('reloadPool'),
    renameTrack: vi.fn().mockName('renameTrack').mockReturnValue(of({})),
    setTrackDisabled: vi.fn().mockName('setTrackDisabled').mockReturnValue(of({})),
    searchDeezer: vi.fn().mockName('searchDeezer').mockReturnValue(of([])),
    _setPoolTracks: (v: PoolTracksResponse) => poolTracks.set(v),
  };
}

function makeDeezerTrackInfo(deezerTrackId: number): DeezerTrackInfo {
  return { artist: `A${deezerTrackId}`, title: `T${deezerTrackId}`, previewUrl: null, deezerTrackId };
}

function makePoolTrack(id: number, hasPreview: boolean, extra: Partial<{
  lastUsedDate: string | null;
  usageCount: number;
  isDisabled: boolean;
  inTodayChallenge: boolean;
}> = {}) {
  return { id, artist: `A${id}`, title: `T${id}`, deezerTrackId: id, hasPreview, usageCount: 0, ...extra };
}

describe('AdminPoolService', () => {
  let service: AdminPoolService;
  let apiStub: ReturnType<typeof makeAdminApiStub>;

  let audioPreviewStub: {
    stop: Mock;
    toggle: Mock;
  };

  beforeEach(() => {
    apiStub = makeAdminApiStub();
    audioPreviewStub = { stop: vi.fn().mockName('stop'), toggle: vi.fn().mockName('toggle') };

    TestBed.configureTestingModule({
      providers: [
        AdminPoolService,
        { provide: AdminApiService, useValue: apiStub },
        { provide: SettingsService, useValue: { tracksPerChallenge: signal(3) } },
        { provide: PoolAudioPreviewService, useValue: audioPreviewStub },
      ],
    });

    service = TestBed.inject(AdminPoolService);
  });

  describe('autonomie du pool', () => {
    it('should be 0 when pool is empty', () => {
      expect(service.poolAvailableWithPreview()).toBe(0);
      expect(service.poolDaysRemaining()).toBe(0);
    });

    it('should count only available tracks with preview and divide by tracksPerChallenge', () => {
      apiStub._setPoolTracks({
        available: [
          makePoolTrack(1, true), makePoolTrack(2, true), makePoolTrack(3, true),
          makePoolTrack(4, true), makePoolTrack(5, true), makePoolTrack(6, true),
          makePoolTrack(7, true), makePoolTrack(8, false), // sans preview → exclu
        ],
        used: [makePoolTrack(9, true)], // utilisé → exclu
      });

      expect(service.poolAvailableWithPreview()).toBe(7);
      expect(service.poolDaysRemaining()).toBe(2); // floor(7 / 3)
    });

    it('should color red under 3 days, orange under 7, green otherwise', () => {
      expect(service.poolDaysColor(2)).toBe('var(--color-fail)');
      expect(service.poolDaysColor(5)).toBe('var(--bg-warn)');
      expect(service.poolDaysColor(7)).toBe('var(--color-success)');
    });
  });

  describe('filtre par plage de dates (lastUsedDate)', () => {
    beforeEach(() => {
      apiStub._setPoolTracks({
        available: [
          makePoolTrack(1, true, { lastUsedDate: null }),
          makePoolTrack(2, true, { lastUsedDate: '2026-01-05' }),
          makePoolTrack(3, true, { lastUsedDate: '2026-01-15' }),
          makePoolTrack(4, true, { lastUsedDate: '2026-01-25' }),
        ],
        used: [],
      });
    });

    it('excludes tracks with lastUsedDate before the "from" bound', () => {
      service.setPoolFilterLastUsedFrom('2026-01-10');
      expect(service.filteredTracks().map(t => t.id)).toEqual([3, 4]);
    });

    it('excludes tracks with lastUsedDate after the "to" bound', () => {
      service.setPoolFilterLastUsedTo('2026-01-20');
      expect(service.filteredTracks().map(t => t.id)).toEqual([2, 3]);
    });

    it('excludes null lastUsedDate as soon as a bound is set', () => {
      service.setPoolFilterLastUsedFrom('2026-01-01');
      expect(service.filteredTracks().map(t => t.id)).not.toContain(1);
    });

    it('is combinable with the existing text filter', () => {
      service.setPoolFilterLastUsedFrom('2026-01-01');
      service.setPoolFilter('A3');
      expect(service.filteredTracks().map(t => t.id)).toEqual([3]);
    });

    it('resets allTracksPage on change', () => {
      service['_allTracksPage'].set(2);
      service.setPoolFilterLastUsedFrom('2026-01-01');
      expect(service.allTracksPage()).toBe(0);
    });
  });

  // La page de la grille est reprise de l'adresse au F5 (?page=, cf. PoolTabComponent).
  describe('pagination', () => {
    beforeEach(() => {
      // 40 morceaux, 15 par page → 3 pages.
      apiStub._setPoolTracks({ available: Array.from({ length: 40 }, (_, i) => makePoolTrack(i + 1, true)), used: [] });
    });

    it('setPage() va à la page demandée', () => {
      service.setPage(2);
      expect(service.allTracksPage()).toBe(2);
      expect(service.pagedAllTracks()).toHaveLength(10);
    });

    it('borne une page trop grande (reprise de l\'adresse) à la dernière page', () => {
      service.setPage(9);
      expect(service.allTracksPage()).toBe(2);
    });

    it('previousPage() repart de la page affichée, pas de la page demandée', () => {
      service.setPage(9);
      service.previousPage();
      expect(service.allTracksPage()).toBe(1);
    });

    it('nextPage() ne dépasse pas la dernière page', () => {
      service.setPage(2);
      service.nextPage();
      expect(service.allTracksPage()).toBe(2);
    });
  });

  describe('tri des colonnes', () => {
    beforeEach(() => {
      apiStub._setPoolTracks({
        available: [
          makePoolTrack(1, true, { lastUsedDate: '2026-01-15', usageCount: 2 }),
          makePoolTrack(2, true, { lastUsedDate: null, usageCount: 0 }),
          makePoolTrack(3, true, { lastUsedDate: '2026-01-05', usageCount: 5 }),
        ],
        used: [],
      });
    });

    it('toggles direction on same-column click', () => {
      service.setPoolSort('artist');
      expect(service.poolSortColumn()).toBe('artist');
      expect(service.poolSortDirection()).toBe('asc');
      service.setPoolSort('artist');
      expect(service.poolSortDirection()).toBe('desc');
    });

    it('resets to asc on a new column', () => {
      service.setPoolSort('artist');
      service.setPoolSort('artist');
      service.setPoolSort('usageCount');
      expect(service.poolSortColumn()).toBe('usageCount');
      expect(service.poolSortDirection()).toBe('asc');
    });

    it('sorts by a text column (artist) ascending and descending', () => {
      service.setPoolSort('artist');
      expect(service.sortedTracks().map(t => t.id)).toEqual([1, 2, 3]);
      service.setPoolSort('artist');
      expect(service.sortedTracks().map(t => t.id)).toEqual([3, 2, 1]);
    });

    it('sorts by a date column (lastUsedDate) with nulls always last', () => {
      service.setPoolSort('lastUsedDate');
      expect(service.sortedTracks().map(t => t.id)).toEqual([3, 1, 2]);
      service.setPoolSort('lastUsedDate');
      expect(service.sortedTracks().map(t => t.id)).toEqual([1, 3, 2]);
    });
  });

  describe('filtre texte (artiste + titre combinés)', () => {
    beforeEach(() => {
      apiStub._setPoolTracks({
        available: [{ id: 1, artist: 'Nicki Minaj', title: 'Starships', deezerTrackId: 101, hasPreview: true, usageCount: 0 }],
        used: [],
      });
    });

    // Régression : avant le fix, un texte combinant artiste + titre ("Nicki Minaj Starships",
    // propagé par "Recherches liées" depuis la recherche Deezer) ne matchait ni l'artiste
    // seul ni le titre seul et faisait disparaître le morceau du tableau.
    const cases: [
      string,
      number[]
    ][] = [
      ['nicki minaj', [1]],
      ['starships', [1]],
      ['Nicki Minaj Starships', [1]],
      ['Daft Punk', []],
    ];
    for (const [query, expectedIds] of cases) {
      it(`"${query}" → ${JSON.stringify(expectedIds)}`, () => {
        service.setPoolFilter(query);
        expect(service.filteredTracks().map(t => t.id)).toEqual(expectedIds);
      });
    }
  });

  describe('morceaux utilisés (sélection / suppression)', () => {
    beforeEach(() => {
      apiStub._setPoolTracks({ available: [makePoolTrack(1, true)], used: [makePoolTrack(2, false)] });
    });

    it('garde l\'état de preview d\'un morceau utilisé', () => {
      const used = service.allTracks().find(t => t.id === 2);
      expect(used?.hasPreview).toBe(false);
    });

    it('selectionHasUsedTrack détecte un morceau utilisé dans la sélection', () => {
      service.toggleSelection(1);
      expect(service.selectionHasUsedTrack()).toBe(false);
      service.toggleSelection(2);
      expect(service.selectionHasUsedTrack()).toBe(true);
    });

    it('openDeleteModal(null) ne s\'ouvre pas si la sélection contient un morceau utilisé', () => {
      service.toggleSelection(1);
      service.toggleSelection(2);
      service.openDeleteModal(null);
      expect(service.deleteModalOpen()).toBe(false);
    });

    it('openDeleteModal(null) s\'ouvre avec les seuls morceaux disponibles sélectionnés', () => {
      service.toggleSelection(1);
      service.openDeleteModal(null);
      expect(service.deleteModalOpen()).toBe(true);
      expect(service.deleteModalTracks().map(t => t.id)).toEqual([1]);
    });
  });

  describe('modification artiste / titre', () => {
    const track = { ...makePoolTrack(5, true), artist: 'Etienne Daho', title: 'Tombe pour la France' };

    it('pré-remplit les champs et désactive « Enregistrer » tant que rien ne change', () => {
      service.openEditModal(track);
      expect(service.editArtist()).toBe('Etienne Daho');
      expect(service.editSaveDisabled()).toBe(true);

      service.editForm.artist().value.set('Étienne Daho');
      expect(service.editSaveDisabled()).toBe(false);

      service.editForm.title().value.set('   ');
      expect(service.editSaveDisabled()).toBe(true);
    });

    it('s\'ouvre aussi pour un morceau du défi du jour', () => {
      service.openEditModal({ ...track, inTodayChallenge: true });
      expect(service.editModalTrack()).not.toBeNull();
    });

    it('envoie les valeurs nettoyées, ferme la modale et recharge le pool', () => {
      service.openEditModal(track);
      service.editForm.artist().value.set('  Étienne Daho ');
      service.confirmEdit();

      expect(apiStub.renameTrack).toHaveBeenCalledWith(5, 'Étienne Daho', 'Tombe pour la France');
      expect(service.editModalTrack()).toBeNull();
      expect(apiStub.reloadPool).toHaveBeenCalled();
    });

    it('passe en erreur sur un échec et garde la modale ouverte', () => {
      apiStub.renameTrack.mockReturnValue(throwError(() => ({ status: 500 })));
      service.openEditModal(track);
      service.editForm.title().value.set('Tombé pour la France');
      service.confirmEdit();

      expect(service.editStatus()).toBe('error');
      expect(service.editModalTrack()).not.toBeNull();
    });
  });

  describe('existingDeezerTrackIds', () => {
    const cases: [
      string,
      PoolTracksResponse,
      boolean | undefined
    ][] = [
      ['available track', { available: [makePoolTrack(101, true)], used: [] }, true],
      ['used track', { available: [], used: [makePoolTrack(101, true)] }, false],
      ['id absent from the pool', { available: [makePoolTrack(101, true)], used: [] }, undefined],
    ];
    for (const [label, pool, expected] of cases) {
      it(`maps a ${label} accordingly`, () => {
        apiStub._setPoolTracks(pool);
        expect(service.existingDeezerTrackIds().get(label === 'id absent from the pool' ? 999 : 101)).toBe(expected);
      });
    }
  });

  describe('addTrackFromPanel (état par ligne)', () => {
    afterEach(() => vi.useRealTimers());

    it('should report idle for a track never added', () => {
      expect(service.addTrackStatus(101)).toBe('idle');
    });

    it('should report loading only for the row being added', () => {
      apiStub.addTrack.mockReturnValue(new Subject<void>()); // ne résout jamais

      service.addTrackFromPanel(makeDeezerTrackInfo(101));

      expect(service.addTrackStatus(101)).toBe('loading');
      expect(service.addTrackStatus(102)).toBe('idle');
    });

    it('should not let a concurrent add on another row clobber the first row\'s state', () => {
      const subjectA = new Subject<void>();
      const subjectB = new Subject<void>();
      apiStub.addTrack.mockImplementation((id: number) => (id === 101 ? subjectA : subjectB) as unknown as Observable<void>);

      service.addTrackFromPanel(makeDeezerTrackInfo(101)); // reste en 'loading'
      service.addTrackFromPanel(makeDeezerTrackInfo(102));
      subjectB.next(void 0); // seule la ligne 102 résout

      expect(service.addTrackStatus(101)).toBe('loading');
      expect(service.addTrackStatus(102)).toBe('success');
      expect(apiStub.reloadPool).toHaveBeenCalledTimes(1);
    });

    it('should set error only for the failing row and reset it after its own timer', () => {
      vi.useFakeTimers();
      apiStub.addTrack.mockReturnValue(throwError(() => new Error('boom')));

      service.addTrackFromPanel(makeDeezerTrackInfo(101));
      expect(service.addTrackStatus(101)).toBe('error');

      vi.advanceTimersByTime(2999);
      expect(service.addTrackStatus(101)).toBe('error');

      vi.advanceTimersByTime(1);
      expect(service.addTrackStatus(101)).toBe('idle');
    });

    it('should reset a successful row to idle after its own timer, independently of other rows', () => {
      vi.useFakeTimers();
      apiStub.addTrack.mockReturnValue(of(void 0));

      service.addTrackFromPanel(makeDeezerTrackInfo(101));
      expect(service.addTrackStatus(101)).toBe('success');

      vi.advanceTimersByTime(1999);
      expect(service.addTrackStatus(101)).toBe('success');

      vi.advanceTimersByTime(1);
      expect(service.addTrackStatus(101)).toBe('idle');
    });

    it('should cancel all pending reset timers and clear every row status on toggleAddPanel close', () => {
      vi.useFakeTimers();
      apiStub.addTrack.mockReturnValue(of(void 0));

      service['_addPanelOpen'].set(true);
      service.addTrackFromPanel(makeDeezerTrackInfo(101));
      expect(service.addTrackStatus(101)).toBe('success');

      service.toggleAddPanel(); // ferme le panneau avant l'expiration du timer 2s
      expect(service.addTrackStatus(101)).toBe('idle');

      vi.advanceTimersByTime(2000); // ne doit pas re-déclencher quoi que ce soit
      expect(service.addTrackStatus(101)).toBe('idle');
    });
  });
  describe('désactivation des morceaux', () => {
    afterEach(() => vi.useRealTimers());

    it('should exclude disabled tracks from the pool runway', () => {
      apiStub._setPoolTracks({
        available: [makePoolTrack(1, true), makePoolTrack(2, true), makePoolTrack(3, true, { isDisabled: true })],
        used: [makePoolTrack(4, true, { isDisabled: true })],
      });

      expect(service.poolAvailableWithPreview()).toBe(2);
      expect(service.disabledCount()).toBe(2);
    });

    it('should always sort disabled tracks last, with or without a sort column', () => {
      apiStub._setPoolTracks({
        available: [makePoolTrack(1, true)],
        used: [makePoolTrack(2, true, { isDisabled: true }), makePoolTrack(3, true), makePoolTrack(4, true, { isDisabled: true })],
      });

      expect(service.sortedTracks().map(t => t.id)).toEqual([1, 3, 2, 4]);

      service.setPoolSort('artist');
      service.setPoolSort('artist'); // desc : A4, A3, A2, A1 sans la règle
      expect(service.sortedTracks().map(t => t.id)).toEqual([3, 1, 4, 2]);
    });

    it('should filter disabled tracks with the "disabled" status', () => {
      apiStub._setPoolTracks({
        available: [makePoolTrack(1, true)],
        used: [makePoolTrack(2, true, { isDisabled: true }), makePoolTrack(3, true)],
      });

      service.setPoolFilterStatus('disabled');

      expect(service.filteredTracks().map(t => t.id)).toEqual([2]);
    });

    it('should disable an enabled track, then reload the pool', () => {
      service.toggleDisabled(makePoolTrack(5, true));

      expect(apiStub.setTrackDisabled).toHaveBeenCalledTimes(1);

      expect(apiStub.setTrackDisabled).toHaveBeenCalledWith(5, true);
      expect(apiStub.reloadPool).toHaveBeenCalled();
      expect(service.togglingDisabledIds().has(5)).toBe(false);
    });

    it('should re-enable a disabled track, even from today\'s challenge', () => {
      service.toggleDisabled(makePoolTrack(5, true, { isDisabled: true, inTodayChallenge: true }));

      expect(apiStub.setTrackDisabled).toHaveBeenCalledTimes(1);

      expect(apiStub.setTrackDisabled).toHaveBeenCalledWith(5, false);
    });

    it('should not call the API to disable a track of today\'s challenge', () => {
      service.toggleDisabled(makePoolTrack(5, true, { inTodayChallenge: true }));

      expect(apiStub.setTrackDisabled).not.toHaveBeenCalled();
    });

    it('should ignore a second click while the request is pending', () => {
      const pending = new Subject<object>();
      apiStub.setTrackDisabled.mockReturnValue(pending);

      service.toggleDisabled(makePoolTrack(5, true));
      service.toggleDisabled(makePoolTrack(5, true));

      expect(apiStub.setTrackDisabled).toHaveBeenCalledTimes(1);
      expect(service.togglingDisabledIds().has(5)).toBe(true);
    });

    it('should show the "in today" error on 409, then clear it after 4s', () => {
      vi.useFakeTimers();
      apiStub.setTrackDisabled.mockReturnValue(throwError(() => ({ status: 409 })));

      service.toggleDisabled(makePoolTrack(5, true));

      expect(service.toggleDisabledError()).toBe('inToday');
      expect(apiStub.reloadPool).not.toHaveBeenCalled();
      vi.advanceTimersByTime(4000);
      expect(service.toggleDisabledError()).toBeNull();
    });

    it('should show a generic error on other failures', () => {
      apiStub.setTrackDisabled.mockReturnValue(throwError(() => ({ status: 500 })));

      service.toggleDisabled(makePoolTrack(5, true));

      expect(service.toggleDisabledError()).toBe('error');
      expect(service.togglingDisabledIds().has(5)).toBe(false);
    });
  });

  // M14 (revue du 25/09) : une réponse Deezer tardive après fermeture de la modale écoute, ou
  // après réouverture sur un autre morceau, appelait quand même audioPreview.toggle(...) et
  // écrasait l'état affiché. La recherche passe désormais par une resource, qui annule la
  // requête précédente dès que le morceau change ou que la modale se ferme.
  describe('modale écoute (openPreviewModal/closePreviewModal)', () => {
    const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve));

    it('should not call audioPreview.toggle for a search that resolves after the modal was closed', () => {
      const pending = new Subject<{
        deezerTrackId: number;
        previewUrl: string | null;
      }[]>();
      apiStub.searchDeezer.mockReturnValue(pending);

      service.openPreviewModal(makePoolTrack(5, true) as any);
      TestBed.tick();
      service.closePreviewModal();
      TestBed.tick();
      pending.next([{ deezerTrackId: 5, previewUrl: 'https://example.com/5.mp3' }]);
      TestBed.tick();

      expect(audioPreviewStub.toggle).not.toHaveBeenCalled();
      expect(service.previewModalUrl()).toBeNull();
    });

    it('should cancel the previous pending search when opening a different track', async () => {
      const firstSearch = new Subject<{
        deezerTrackId: number;
        previewUrl: string | null;
      }[]>();
      apiStub.searchDeezer.mockReturnValue(firstSearch);

      const trackA = makePoolTrack(5, true) as any;
      const trackB = makePoolTrack(6, true) as any;
      service.openPreviewModal(trackA);
      TestBed.tick();

      const secondSearch = new Subject<{
        deezerTrackId: number;
        previewUrl: string | null;
      }[]>();
      apiStub.searchDeezer.mockReturnValue(secondSearch);
      service.openPreviewModal(trackB);
      TestBed.tick();
      // La resource s'abonne au flux de recherche après une micro-tâche : sans cette attente,
      // la réponse émise juste après (Subject sans rejeu) partirait avant l'abonnement.
      await flushMicrotasks();

      // La réponse tardive du premier morceau ne doit plus rien pouvoir modifier.
      firstSearch.next([{ deezerTrackId: 5, previewUrl: 'https://example.com/5.mp3' }]);
      TestBed.tick();

      expect(service.previewModalTrack()).toBe(trackB);
      expect(service.previewModalUrl()).toBeNull();
      expect(audioPreviewStub.toggle).not.toHaveBeenCalled();

      secondSearch.next([{ deezerTrackId: 6, previewUrl: 'https://example.com/6.mp3' }]);
      await flushMicrotasks(); // la resource passe à « resolved » dans une micro-tâche
      TestBed.tick();

      expect(service.previewModalUrl()).toBe('https://example.com/6.mp3');
      expect(audioPreviewStub.toggle).toHaveBeenCalledTimes(1);
      expect(audioPreviewStub.toggle).toHaveBeenCalledWith('https://example.com/6.mp3');
    });
  });
});
