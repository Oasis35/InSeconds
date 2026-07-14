import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { AdminStatsService } from './admin-stats.service';
import { AdminApiService } from './admin-api.service';
import { AdminStatsResponse, DailyActivityDto } from '../../../api/api.generated';
import { PoolTracksResponse } from '../admin.models';

/** Construit un AdminStatsResponse valide avec des overrides partiels. */
function makeStats(overrides: Partial<AdminStatsResponse> = {}): AdminStatsResponse {
  return {
    challenges: [],
    dailyActivity: [],
    playerBreakdown: { totalGuests: 0, totalRegistered: 0, activeLast7Days: 0, activeLast30Days: 0 },
    availableDates: [],
    selectedDayKpis: undefined,
    ...overrides,
  };
}

function makeActivity(date: string, playerCount: number): DailyActivityDto {
  return { date: new Date(date + 'T12:00:00Z'), playerCount };
}

/** Stub minimal d'AdminApiService qui expose les mêmes signals que le vrai service. */
function makeAdminApiStub() {
  const selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  const adminStats = signal<AdminStatsResponse | null>(null);
  const statsLoading = signal(false);
  const challenges = signal<any[]>([]);
  const poolTracks = signal<PoolTracksResponse>({ available: [], used: [] });

  return {
    selectedDay,
    adminStats: computed(() => adminStats()),
    statsLoading: computed(() => statsLoading()),
    challenges: computed(() => challenges()),
    poolTracks: computed(() => poolTracks()),
    // helpers to set values in tests
    _setAdminStats: (v: AdminStatsResponse | null) => adminStats.set(v),
    _setChallenges: (v: any[]) => challenges.set(v),
    _setPoolTracks: (v: PoolTracksResponse) => poolTracks.set(v),
    reloadStats: () => {},
    reloadAll: () => {},
  };
}

describe('AdminStatsService', () => {
  let service: AdminStatsService;
  let apiStub: ReturnType<typeof makeAdminApiStub>;

  beforeEach(() => {
    apiStub = makeAdminApiStub();

    TestBed.configureTestingModule({
      providers: [
        AdminStatsService,
        { provide: AdminApiService, useValue: apiStub },
      ],
    });

    service = TestBed.inject(AdminStatsService);
  });

  describe('computed helpers on empty data', () => {
    it('totalPlayers should be 0 with no stats', () => {
      expect(service.totalPlayers()).toBe(0);
    });

    it('maxDailyPlayers should be 0 with no stats', () => {
      expect(service.maxDailyPlayers()).toBe(0);
    });

    it('challengeMonths should be empty with no stats', () => {
      expect(service.challengeMonths()).toEqual([]);
    });

    it('challengesForMonth should be empty with no stats', () => {
      expect(service.challengesForMonth()).toEqual([]);
    });
  });

  describe('totalPlayers computed', () => {
    it('should sum playerCount across all daily activity entries', () => {
      apiStub._setAdminStats(makeStats({
        dailyActivity: [
          makeActivity('2026-06-27', 5),
          makeActivity('2026-06-28', 10),
          makeActivity('2026-06-29', 3),
        ],
      }));

      expect(service.totalPlayers()).toBe(18);
    });
  });

  describe('maxDailyPlayers computed', () => {
    it('should return the maximum playerCount', () => {
      apiStub._setAdminStats(makeStats({
        dailyActivity: [
          makeActivity('2026-06-27', 5),
          makeActivity('2026-06-28', 42),
          makeActivity('2026-06-29', 12),
        ],
      }));

      expect(service.maxDailyPlayers()).toBe(42);
    });
  });

  describe('toggleChallenge()', () => {
    it('should add id to expandedChallenges when not present', () => {
      service.toggleChallenge(1);
      expect(service.expandedChallenges().has(1)).toBeTrue();
    });

    it('should remove id from expandedChallenges when already present', () => {
      service.toggleChallenge(1);
      service.toggleChallenge(1);
      expect(service.expandedChallenges().has(1)).toBeFalse();
    });

    it('should handle multiple ids independently', () => {
      service.toggleChallenge(1);
      service.toggleChallenge(2);
      expect(service.expandedChallenges().has(1)).toBeTrue();
      expect(service.expandedChallenges().has(2)).toBeTrue();
      service.toggleChallenge(1);
      expect(service.expandedChallenges().has(1)).toBeFalse();
      expect(service.expandedChallenges().has(2)).toBeTrue();
    });
  });

  describe('formatChallengeMonth()', () => {
    it('should format "2026-01" as "Janvier 2026"', () => {
      expect(service.formatChallengeMonth('2026-01')).toBe('Janvier 2026');
    });

    it('should format "2025-12" as "Décembre 2025"', () => {
      expect(service.formatChallengeMonth('2025-12')).toBe('Décembre 2025');
    });

    it('should format "2026-06" as "Juin 2026"', () => {
      expect(service.formatChallengeMonth('2026-06')).toBe('Juin 2026');
    });

    it('should format "2026-08" as "Août 2026"', () => {
      expect(service.formatChallengeMonth('2026-08')).toBe('Août 2026');
    });
  });

  describe('activityBarHeightPx()', () => {
    it('should return "2px" when max is 0', () => {
      expect(service.activityBarHeightPx(0)).toBe('2px');
    });

    it('should return "2px" when count is 0 (even if max > 0)', () => {
      apiStub._setAdminStats(makeStats({
        dailyActivity: [makeActivity('2026-06-29', 10)],
      }));

      expect(service.activityBarHeightPx(0)).toBe('2px');
    });

    it('should return the correct height for a bar at 50% of max', () => {
      apiStub._setAdminStats(makeStats({
        dailyActivity: [makeActivity('2026-06-29', 100)],
      }));

      const result = service.activityBarHeightPx(50);
      // 50/100 * 64 = 32px
      expect(result).toBe('32px');
    });
  });

  describe('completionRateColor()', () => {
    it('should return green for rates >= 70', () => {
      expect(service.completionRateColor(70)).toBe('text-green-400');
      expect(service.completionRateColor(100)).toBe('text-green-400');
    });

    it('should return yellow for rates between 40 and 69', () => {
      expect(service.completionRateColor(40)).toBe('text-yellow-400');
      expect(service.completionRateColor(69)).toBe('text-yellow-400');
    });

    it('should return red for rates below 40', () => {
      expect(service.completionRateColor(39)).toBe('text-red-400');
      expect(service.completionRateColor(0)).toBe('text-red-400');
    });
  });

  describe('rateColor()', () => {
    it('should return green for rates >= 60', () => {
      expect(service.rateColor(60)).toBe('text-green-400');
      expect(service.rateColor(100)).toBe('text-green-400');
    });

    it('should return yellow for rates between 30 and 59', () => {
      expect(service.rateColor(30)).toBe('text-yellow-400');
      expect(service.rateColor(59)).toBe('text-yellow-400');
    });

    it('should return red for rates below 30', () => {
      expect(service.rateColor(29)).toBe('text-red-400');
      expect(service.rateColor(0)).toBe('text-red-400');
    });
  });

  describe('rateBarColor()', () => {
    it('should return bg-green-500 for rates >= 60', () => {
      expect(service.rateBarColor(60)).toBe('bg-green-500');
    });

    it('should return bg-yellow-500 for rates between 30 and 59', () => {
      expect(service.rateBarColor(30)).toBe('bg-yellow-500');
    });

    it('should return bg-red-500 for rates below 30', () => {
      expect(service.rateBarColor(29)).toBe('bg-red-500');
    });
  });

  describe('toIso()', () => {
    it('should return the first 10 chars when given a string', () => {
      expect(service.toIso('2026-06-29T12:00:00Z')).toBe('2026-06-29');
      expect(service.toIso('2026-06-29')).toBe('2026-06-29');
    });
  });

  describe('isBarSelected()', () => {
    it('should return true when date matches selectedDay', () => {
      apiStub.selectedDay.set('2026-06-29');
      expect(service.isBarSelected('2026-06-29')).toBeTrue();
    });

    it('should return false when date does not match selectedDay', () => {
      apiStub.selectedDay.set('2026-06-28');
      expect(service.isBarSelected('2026-06-29')).toBeFalse();
    });
  });

  describe('selectDay()', () => {
    it('should update selectedDay signal', () => {
      service.selectDay('2026-01-15');
      expect(apiStub.selectedDay()).toBe('2026-01-15');
    });
  });

  describe('shiftChallengeMonth()', () => {
    beforeEach(() => {
      apiStub._setAdminStats(makeStats({
        challenges: [
          { id: 1, date: new Date('2026-05-01T12:00:00Z'), playerCount: 0, pendingCount: 0, abandonedCount: 0, scoreMin: undefined, scoreMax: undefined, scoreAvg: undefined, scoreMedian: undefined, tracks: [] },
          { id: 2, date: new Date('2026-06-01T12:00:00Z'), playerCount: 0, pendingCount: 0, abandonedCount: 0, scoreMin: undefined, scoreMax: undefined, scoreAvg: undefined, scoreMedian: undefined, tracks: [] },
          { id: 3, date: new Date('2026-07-01T12:00:00Z'), playerCount: 0, pendingCount: 0, abandonedCount: 0, scoreMin: undefined, scoreMax: undefined, scoreAvg: undefined, scoreMedian: undefined, tracks: [] },
        ],
      }));
    });

    it('should shift to next month (delta=1 goes toward more recent)', () => {
      // months are sorted DESC: ['2026-07', '2026-06', '2026-05']
      service.challengeMonth.set('2026-06');
      service.shiftChallengeMonth(1);
      expect(service.challengeMonth()).toBe('2026-07');
    });

    it('should shift to previous month (delta=-1 goes toward older)', () => {
      service.challengeMonth.set('2026-06');
      service.shiftChallengeMonth(-1);
      expect(service.challengeMonth()).toBe('2026-05');
    });

    it('should not shift beyond the oldest month', () => {
      service.challengeMonth.set('2026-05');
      service.shiftChallengeMonth(-1);
      // idx=2 (last), next = 2-(-1) = 3 which is out of range, so no change
      expect(service.challengeMonth()).toBe('2026-05');
    });
  });

  describe('isSelectedDayToday()', () => {
    it('should return true when selectedDay is today', () => {
      const today = new Date().toISOString().slice(0, 10);
      apiStub.selectedDay.set(today);
      expect(service.isSelectedDayToday()).toBeTrue();
    });

    it('should return false when selectedDay is not today', () => {
      apiStub.selectedDay.set('2000-01-01');
      expect(service.isSelectedDayToday()).toBeFalse();
    });
  });

  describe('canGoToPrevDay() / canGoToNextDay()', () => {
    it('should return false when no available dates', () => {
      expect(service.canGoToPrevDay()).toBeFalse();
      expect(service.canGoToNextDay()).toBeFalse();
    });

    it('should return false for prevDay when on oldest date', () => {
      apiStub._setAdminStats(makeStats({
        availableDates: [
          new Date('2026-06-29T12:00:00Z'),
          new Date('2026-06-28T12:00:00Z'),
          new Date('2026-06-27T12:00:00Z'),
        ],
      }));
      apiStub.selectedDay.set('2026-06-27');
      expect(service.canGoToPrevDay()).toBeFalse();
    });

    it('should return true for nextDay when not on most recent date', () => {
      apiStub._setAdminStats(makeStats({
        availableDates: [
          new Date('2026-06-29T12:00:00Z'),
          new Date('2026-06-28T12:00:00Z'),
        ],
      }));
      apiStub.selectedDay.set('2026-06-28');
      expect(service.canGoToNextDay()).toBeTrue();
    });
  });
});
