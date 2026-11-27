import { WeekReview, barRatio, isMonday, showWeekCard } from './week-review';

const review = (over: Partial<WeekReview> = {}): WeekReview => ({
  weekStart: '2026-11-16', days: [], maxPossibleScore: 4250, playedCount: 4, averageScore: 2740, bestDay: '2026-11-17', bestScore: 3120, bestTrack: null, ...over,
});

describe('semaine dernière', () => {
  it('isMonday : lundi seulement', () => {
    expect(isMonday('2026-11-23')).toBe(true);
    expect(isMonday('2026-11-24')).toBe(false);
    expect(isMonday('2026-11-22')).toBe(false);
  });

  it('la carte de l\'accueil : un compte, un lundi, au moins un jour joué, pas déjà fermée', () => {
    const base = { linked: true, today: '2026-11-23', review: review(), dismissedWeek: null };
    expect(showWeekCard(base)).toBe(true);
    expect(showWeekCard({ ...base, linked: false })).toBe(false);
    expect(showWeekCard({ ...base, today: '2026-11-24' })).toBe(false);
    expect(showWeekCard({ ...base, review: review({ playedCount: 0 }) })).toBe(false);
    expect(showWeekCard({ ...base, review: null })).toBe(false);
    expect(showWeekCard({ ...base, dismissedWeek: '2026-11-16' })).toBe(false);
    expect(showWeekCard({ ...base, dismissedWeek: '2026-11-09' })).toBe(true);
  });

  it('barRatio : proportion bornée, 0 sans score', () => {
    expect(barRatio(null, 4250)).toBe(0);
    expect(barRatio(2125, 4250)).toBeCloseTo(0.5);
    expect(barRatio(9000, 4250)).toBe(1);
    expect(barRatio(100, 0)).toBe(0);
  });
});
