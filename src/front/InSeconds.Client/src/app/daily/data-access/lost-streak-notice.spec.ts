import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { EMPTY_STREAK, Streak } from '../domain/streak';
import { LOST_STREAK_SEEN_KEY, LostStreakNotice } from './lost-streak-notice';

describe('LostStreakNotice', () => {
  let storage: MemoryStoragePort;
  let notice: LostStreakNotice;
  const lost = (lastPlayedDate: string): Streak => ({ ...EMPTY_STREAK, lostStreak: 9, lastPlayedDate });

  beforeEach(() => {
    storage = new MemoryStoragePort();
    TestBed.configureTestingModule({ providers: [LostStreakNotice, { provide: StoragePort, useValue: storage }] });
    notice = TestBed.inject(LostStreakNotice);
  });

  it('annonce une série perdue une seule fois', () => {
    expect(notice.take(lost('2026-10-01'))).toBe(9);
    expect(storage.get(LOST_STREAK_SEEN_KEY)).toBe('2026-10-01');
    expect(notice.take(lost('2026-10-01'))).toBeNull();
  });

  it('une autre série perdue (autre dernier défi joué) s\'annonce à son tour', () => {
    notice.take(lost('2026-10-01'));
    expect(notice.take(lost('2026-10-08'))).toBe(9);
  });

  it('rien de perdu, ou sans date du dernier défi : rien à annoncer ni à noter', () => {
    expect(notice.take(EMPTY_STREAK)).toBeNull();
    expect(notice.take({ ...EMPTY_STREAK, lostStreak: 9 })).toBeNull();
    expect(storage.get(LOST_STREAK_SEEN_KEY)).toBeNull();
  });
});
