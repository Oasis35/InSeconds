import { TestBed } from '@angular/core/testing';
import { BrowserStoragePort, StoragePort } from './storage.port';

describe('StoragePort', () => {
  afterEach(() => localStorage.removeItem('storage-port-test'));

  it('utilise localStorage par défaut', () => {
    const storage = TestBed.inject(StoragePort);

    storage.set('storage-port-test', 'x');

    expect(storage).toBeInstanceOf(BrowserStoragePort);
    expect(localStorage.getItem('storage-port-test')).toBe('x');
    storage.remove('storage-port-test');
    expect(storage.get('storage-port-test')).toBeNull();
  });

  it('ne lève jamais quand localStorage est indisponible', () => {
    const storage = new BrowserStoragePort();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });

    expect(storage.get('k')).toBeNull();
    expect(() => storage.set('k', 'v')).not.toThrow();
    expect(() => storage.remove('k')).not.toThrow();
    vi.restoreAllMocks();
  });
});
