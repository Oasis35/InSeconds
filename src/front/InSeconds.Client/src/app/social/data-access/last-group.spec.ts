import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { LastGroup } from './last-group';

describe('LastGroup', () => {
  let storage: MemoryStoragePort;
  let last: LastGroup;

  beforeEach(() => {
    storage = new MemoryStoragePort();
    TestBed.configureTestingModule({ providers: [{ provide: StoragePort, useValue: storage }] });
    last = TestBed.inject(LastGroup);
  });

  it('garde l\'identifiant du dernier groupe regardé', () => {
    expect(last.get()).toBeNull();

    last.set(7);

    expect(last.get()).toBe(7);
    expect(storage.get('inseconds.lastGroup')).toBe('7');
  });

  it('ignore ce qui n\'est pas un identifiant', () => {
    storage.set('inseconds.lastGroup', 'abc');
    expect(last.get()).toBeNull();

    last.set(0);
    expect(last.get()).toBeNull();
  });
});
