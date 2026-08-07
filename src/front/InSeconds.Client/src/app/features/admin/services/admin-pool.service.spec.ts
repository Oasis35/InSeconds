import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { AdminPoolService } from './admin-pool.service';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { PoolTracksResponse } from '../admin.models';

/** Stub minimal d'AdminApiService : uniquement les signals consommés par AdminPoolService. */
function makeAdminApiStub() {
  const poolTracks = signal<PoolTracksResponse>({ available: [], used: [] });
  const poolSearchQuery = signal('');

  return {
    poolTracks: computed(() => poolTracks()),
    poolTracksLoading: computed(() => false),
    poolSearchResults: computed(() => []),
    poolSearchLoading: computed(() => false),
    poolSearchQuery,
    _setPoolTracks: (v: PoolTracksResponse) => poolTracks.set(v),
  };
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
});
