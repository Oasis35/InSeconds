import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../storage/storage.port';
import { FakeSoundPort, SoundPort } from './sound.port';
import { provideSoundsAvailable } from './sound-feature';
import { SoundService } from './sound.service';

describe('SoundService', () => {
  function setup(stored: string | null = null, available = true) {
    const storage = new MemoryStoragePort();
    if (stored) storage.set('inseconds.sounds', stored);
    const port = new FakeSoundPort();
    TestBed.configureTestingModule({
      providers: [{ provide: StoragePort, useValue: storage }, { provide: SoundPort, useValue: port }, provideSoundsAvailable(available)],
    });
    return { service: TestBed.inject(SoundService), port, storage };
  }

  it('rien ne joue ni ne se déverrouille quand les bruitages sont retirés de cette version, même activés', () => {
    const { service, port } = setup(null, false);
    service.unlock();
    service.play('correct');
    expect(service.available).toBe(false);
    expect(service.enabled()).toBe(false);
    expect(port.unlocks).toBe(0);
    expect(port.played).toEqual([]);
  });

  it('par défaut, les bruitages sont retirés de cette version', () => {
    const port = new FakeSoundPort();
    TestBed.configureTestingModule({ providers: [{ provide: StoragePort, useValue: new MemoryStoragePort() }, { provide: SoundPort, useValue: port }] });
    expect(TestBed.inject(SoundService).available).toBe(false);
  });

  it('joue les sons par défaut', () => {
    const { service, port } = setup();
    service.unlock();
    service.play('correct');
    expect(service.enabled()).toBe(true);
    expect(port.unlocks).toBe(1);
    expect(port.played).toEqual(['correct']);
  });

  it('ne joue rien et ne déverrouille rien quand les sons sont coupés, et garde le choix', () => {
    const { service, port, storage } = setup();
    service.setEnabled(false);
    service.unlock();
    service.play('wrong');
    expect(port.unlocks).toBe(0);
    expect(port.played).toEqual([]);
    expect(storage.get('inseconds.sounds')).toBe('off');
  });

  it('relit le choix gardé', () => {
    expect(setup('off').service.enabled()).toBe(false);
  });

  it('les rallume en déverrouillant le contexte audio et efface le choix', () => {
    const { service, port, storage } = setup('off');
    service.setEnabled(true);
    expect(service.enabled()).toBe(true);
    expect(port.unlocks).toBe(1);
    expect(storage.get('inseconds.sounds')).toBeNull();
  });
});
