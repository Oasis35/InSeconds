import { TestBed } from '@angular/core/testing';
import { StoragePort } from '../../core/storage/storage.port';
import { LAST_VISIT_DAY_KEY, ReturnVisit } from './return-visit';

class MemoryStorage extends StoragePort {
  readonly data = new Map<string, string>();
  get(key: string): string | null { return this.data.get(key) ?? null; }
  set(key: string, value: string): void { this.data.set(key, value); }
  remove(key: string): void { this.data.delete(key); }
}

describe('ReturnVisit', () => {
  let storage: MemoryStorage;
  let visit: ReturnVisit;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({ providers: [ReturnVisit, { provide: StoragePort, useValue: storage }] });
    visit = TestBed.inject(ReturnVisit);
  });

  it('la première visite du jour accueille, et note le jour', () => {
    expect(visit.check('2026-11-12')).toBe(false);
    expect(storage.data.get(LAST_VISIT_DAY_KEY)).toBe('2026-11-12');
  });

  it('une autre visite le même jour est un retour', () => {
    visit.check('2026-11-12');
    expect(visit.check('2026-11-12')).toBe(true);
  });

  it('le lendemain, on accueille de nouveau', () => {
    visit.check('2026-11-12');
    expect(visit.check('2026-11-13')).toBe(false);
    expect(visit.check('2026-11-13')).toBe(true);
  });
});
