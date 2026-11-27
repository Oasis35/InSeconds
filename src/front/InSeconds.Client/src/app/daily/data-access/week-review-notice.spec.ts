import { TestBed } from '@angular/core/testing';
import { StoragePort } from '../../core/storage/storage.port';
import { WEEK_REVIEW_DISMISSED_KEY, WeekReviewNotice } from './week-review-notice';

class MemoryStorage extends StoragePort {
  readonly values = new Map<string, string>();
  get(key: string): string | null { return this.values.get(key) ?? null; }
  set(key: string, value: string): void { this.values.set(key, value); }
  remove(key: string): void { this.values.delete(key); }
}

describe('WeekReviewNotice', () => {
  function create() {
    const storage = new MemoryStorage();
    TestBed.configureTestingModule({ providers: [{ provide: StoragePort, useValue: storage }] });
    return { notice: TestBed.inject(WeekReviewNotice), storage };
  }

  it('garde la semaine fermée', () => {
    const { notice } = create();
    expect(notice.dismissedWeek()).toBeNull();
    notice.remember('2026-11-16');
    expect(notice.dismissedWeek()).toBe('2026-11-16');
  });

  it('une valeur illisible compte pour « jamais fermée »', () => {
    const { notice, storage } = create();
    storage.set(WEEK_REVIEW_DISMISSED_KEY, 'n\'importe quoi');
    expect(notice.dismissedWeek()).toBeNull();
  });
});
