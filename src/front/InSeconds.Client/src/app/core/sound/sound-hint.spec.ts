import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../storage/storage.port';
import { SoundHint } from './sound-hint';

describe('SoundHint', () => {
  it("n'est montrée qu'une fois, et le souvenir reste dans le navigateur", () => {
    const storage = new MemoryStoragePort();
    TestBed.configureTestingModule({ providers: [{ provide: StoragePort, useValue: storage }] });
    const hint = TestBed.inject(SoundHint);
    expect(hint.pending()).toBe(true);
    hint.markSeen();
    expect(hint.pending()).toBe(false);
    expect(storage.get('inseconds.soundHintSeen')).toBe('1');
  });

  it('relit le souvenir', () => {
    const storage = new MemoryStoragePort();
    storage.set('inseconds.soundHintSeen', '1');
    TestBed.configureTestingModule({ providers: [{ provide: StoragePort, useValue: storage }] });
    expect(TestBed.inject(SoundHint).pending()).toBe(false);
  });
});
