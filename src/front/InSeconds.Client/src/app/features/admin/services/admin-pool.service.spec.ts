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
    poolSearchResults: computed(() => []),
    poolSearchLoading: computed(() => false),
    poolSearchQuery,
    addTrack: jasmine.createSpy('addTrack').and.returnValue(of(void 0)),
    reloadPool: jasmine.createSpy('reloadPool'),
    _setPoolTracks: (v: PoolTracksResponse) => poolTracks.set(v),
  };
}

function makeDeezerTrackInfo(deezerTrackId: number): DeezerTrackInfo {
  return { artist: `A${deezerTrackId}`, title: `T${deezerTrackId}`, previewUrl: null, deezerTrackId };
}

function makePoolTrack(id: number, hasPreview: boolean, extra: Partial<{ lastUsedDate: string | null; usageCount: number }> = {}) {
  return { id, artist: `A${id}`, title: `T${id}`, deezerTrackId: id, hasPreview, usageCount: 0, ...extra };
}

describe('AdminPoolService', () => {
  let service: AdminPoolService;
  let apiStub: ReturnType<typeof makeAdminApiStub>;

  beforeEach(() => {
    apiStub = makeAdminApiStub();

    TestBed.configureTestingModule({
      providers: [
        AdminPoolService,
        { provide: AdminApiService, useValue: apiStub },
        { provide: SettingsService, useValue: { tracksPerChallenge: signal(3) } },
        { provide: PoolAudioPreviewService, useValue: { stop: () => {}, toggle: () => {} } },
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
      service.allTracksPage.set(2);
      service.setPoolFilterLastUsedFrom('2026-01-01');
      expect(service.allTracksPage()).toBe(0);
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
    const cases: [string, number[]][] = [
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
      expect(used?.hasPreview).toBeFalse();
    });

    it('selectionHasUsedTrack détecte un morceau utilisé dans la sélection', () => {
      service.toggleSelection(1);
      expect(service.selectionHasUsedTrack()).toBeFalse();
      service.toggleSelection(2);
      expect(service.selectionHasUsedTrack()).toBeTrue();
    });

    it('openDeleteModal(null) ne s\'ouvre pas si la sélection contient un morceau utilisé', () => {
      service.toggleSelection(1);
      service.toggleSelection(2);
      service.openDeleteModal(null);
      expect(service.deleteModalOpen()).toBeFalse();
    });

    it('openDeleteModal(null) s\'ouvre avec les seuls morceaux disponibles sélectionnés', () => {
      service.toggleSelection(1);
      service.openDeleteModal(null);
      expect(service.deleteModalOpen()).toBeTrue();
      expect(service.deleteModalTracks().map(t => t.id)).toEqual([1]);
    });
  });

  describe('existingDeezerTrackIds', () => {
    const cases: [string, PoolTracksResponse, boolean | undefined][] = [
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
    afterEach(() => jasmine.clock().uninstall());

    it('should report idle for a track never added', () => {
      expect(service.addTrackStatus(101)).toBe('idle');
    });

    it('should report loading only for the row being added', () => {
      apiStub.addTrack.and.returnValue(new Subject<void>()); // ne résout jamais

      service.addTrackFromPanel(makeDeezerTrackInfo(101));

      expect(service.addTrackStatus(101)).toBe('loading');
      expect(service.addTrackStatus(102)).toBe('idle');
    });

    it('should not let a concurrent add on another row clobber the first row\'s state', () => {
      const subjectA = new Subject<void>();
      const subjectB = new Subject<void>();
      apiStub.addTrack.and.callFake((id: number) => (id === 101 ? subjectA : subjectB) as unknown as Observable<void>);

      service.addTrackFromPanel(makeDeezerTrackInfo(101)); // reste en 'loading'
      service.addTrackFromPanel(makeDeezerTrackInfo(102));
      subjectB.next(void 0); // seule la ligne 102 résout

      expect(service.addTrackStatus(101)).toBe('loading');
      expect(service.addTrackStatus(102)).toBe('success');
      expect(apiStub.reloadPool).toHaveBeenCalledTimes(1);
    });

    it('should set error only for the failing row and reset it after its own timer', () => {
      jasmine.clock().install();
      apiStub.addTrack.and.returnValue(throwError(() => new Error('boom')));

      service.addTrackFromPanel(makeDeezerTrackInfo(101));
      expect(service.addTrackStatus(101)).toBe('error');

      jasmine.clock().tick(2999);
      expect(service.addTrackStatus(101)).toBe('error');

      jasmine.clock().tick(1);
      expect(service.addTrackStatus(101)).toBe('idle');
    });

    it('should reset a successful row to idle after its own timer, independently of other rows', () => {
      jasmine.clock().install();
      apiStub.addTrack.and.returnValue(of(void 0));

      service.addTrackFromPanel(makeDeezerTrackInfo(101));
      expect(service.addTrackStatus(101)).toBe('success');

      jasmine.clock().tick(1999);
      expect(service.addTrackStatus(101)).toBe('success');

      jasmine.clock().tick(1);
      expect(service.addTrackStatus(101)).toBe('idle');
    });

    it('should cancel all pending reset timers and clear every row status on toggleAddPanel close', () => {
      jasmine.clock().install();
      apiStub.addTrack.and.returnValue(of(void 0));

      service.addPanelOpen.set(true);
      service.addTrackFromPanel(makeDeezerTrackInfo(101));
      expect(service.addTrackStatus(101)).toBe('success');

      service.toggleAddPanel(); // ferme le panneau avant l'expiration du timer 2s
      expect(service.addTrackStatus(101)).toBe('idle');

      jasmine.clock().tick(2000); // ne doit pas re-déclencher quoi que ce soit
      expect(service.addTrackStatus(101)).toBe('idle');
    });
  });
});
