import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { GUEST_TILE_DISMISSED_KEY, GuestStreakNotice } from './guest-streak-notice';

describe('GuestStreakNotice', () => {
  let storage: MemoryStoragePort;
  let notice: GuestStreakNotice;

  beforeEach(() => {
    storage = new MemoryStoragePort();
    TestBed.configureTestingModule({ providers: [GuestStreakNotice, { provide: StoragePort, useValue: storage }] });
    notice = TestBed.inject(GuestStreakNotice);
  });

  it('jamais fermée : rien de mémorisé', () => {
    expect(notice.dismissed()).toBeNull();
  });

  it('garde le jour et la série de la dernière fermeture', () => {
    notice.remember({ day: '2026-11-25', streak: 2 });
    expect(notice.dismissed()).toEqual({ day: '2026-11-25', streak: 2 });
    notice.remember({ day: '2026-12-01', streak: 7 });
    expect(notice.dismissed()).toEqual({ day: '2026-12-01', streak: 7 });
  });

  it.each(['oui', '{"day":"hier","streak":2}', '{"day":"2026-11-25"}', '12', 'null'])('une valeur illisible (%s) compte comme jamais fermée', raw => {
    storage.set(GUEST_TILE_DISMISSED_KEY, raw);
    expect(notice.dismissed()).toBeNull();
  });
});
