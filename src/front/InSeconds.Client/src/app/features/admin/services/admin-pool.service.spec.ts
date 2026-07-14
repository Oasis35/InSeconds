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

function makePoolTrack(id: number, hasPreview: boolean) {
  return { id, artist: `A${id}`, title: `T${id}`, deezerTrackId: id, hasPreview };
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
      expect(service.poolDaysColor(2)).toBe('text-red-400');
      expect(service.poolDaysColor(5)).toBe('text-orange-400');
      expect(service.poolDaysColor(7)).toBe('text-green-400');
    });
  });
});
