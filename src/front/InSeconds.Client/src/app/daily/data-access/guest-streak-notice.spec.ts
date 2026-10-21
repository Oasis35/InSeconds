import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { GUEST_STREAK_DISMISSED_KEY, GuestStreakNotice } from './guest-streak-notice';

describe('GuestStreakNotice', () => {
  let storage: MemoryStoragePort;
  let notice: GuestStreakNotice;

  beforeEach(() => {
    storage = new MemoryStoragePort();
    TestBed.configureTestingModule({ providers: [GuestStreakNotice, { provide: StoragePort, useValue: storage }] });
    notice = TestBed.inject(GuestStreakNotice);
  });

  it('jamais fermé : rien de mémorisé', () => {
    expect(notice.dismissedAt()).toBeNull();
  });

  it('garde la série de la dernière fermeture', () => {
    notice.remember(2);
    expect(storage.get(GUEST_STREAK_DISMISSED_KEY)).toBe('2');
    notice.remember(7);
    expect(notice.dismissedAt()).toBe(7);
  });

  it('une valeur illisible compte comme jamais fermé', () => {
    storage.set(GUEST_STREAK_DISMISSED_KEY, 'oui');
    expect(notice.dismissedAt()).toBeNull();
  });
});
