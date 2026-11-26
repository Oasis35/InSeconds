import { TestBed } from '@angular/core/testing';
import { WeekReview } from '../domain/week-review';
import { FakeDailyApi, provideFakeDailyApi } from './testing/fake-daily-api';
import { WeekReviewStore } from './week-review.store';

const REVIEW: WeekReview = {
  weekStart: '2026-11-16', days: [], maxPossibleScore: 4250, playedCount: 3, averageScore: 2500, bestDay: '2026-11-17', bestScore: 3000, bestTrack: null,
};

describe('WeekReviewStore', () => {
  function create(fake: FakeDailyApi) {
    TestBed.configureTestingModule({ providers: [WeekReviewStore, provideFakeDailyApi(fake)] });
    return TestBed.inject(WeekReviewStore);
  }

  it('lit le bilan une seule fois', async () => {
    const fake = new FakeDailyApi();
    fake.weekReview = REVIEW;
    const store = create(fake);

    await store.load();
    await store.load();

    expect(fake.calls.filter(c => c === 'weekReview')).toHaveLength(1);
    expect(store.status()).toBe('ready');
    expect(store.review()?.playedCount).toBe(3);
  });

  it('un échec passe en erreur sans bilan', async () => {
    const fake = new FakeDailyApi();
    fake.weekReview = new Error('panne');
    const store = create(fake);

    await store.load();

    expect(store.status()).toBe('error');
    expect(store.review()).toBeNull();
  });
});
