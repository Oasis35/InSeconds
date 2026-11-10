import { TestBed } from '@angular/core/testing';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { FakeAudioPort, provideFakeAudio } from '../../gameplay/data-access/testing/fake-audio.port';
import { RunSounds, SOUNDS_MUTED_KEY } from './run-sounds';

describe('RunSounds', () => {
  let audio: FakeAudioPort;
  let storage: MemoryStoragePort;

  const create = (): RunSounds => {
    TestBed.configureTestingModule({ providers: [RunSounds, provideFakeAudio(audio), { provide: StoragePort, useValue: storage }] });
    return TestBed.inject(RunSounds);
  };

  /** Réveillé dans un clic : le contexte passe en marche (le Chromium des tests ne demande pas de geste). */
  const awake = async (): Promise<RunSounds> => {
    const sounds = create();
    sounds.unlock();
    await vi.waitFor(() => expect((sounds as unknown as { context: AudioContext }).context.state).toBe('running'));
    return sounds;
  };

  beforeEach(() => {
    audio = new FakeAudioPort();
    storage = new MemoryStoragePort();
  });

  afterEach(() => vi.restoreAllMocks());

  it('réveillé dans un clic, un son se joue vraiment : une note par note du son', async () => {
    const sounds = await awake();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('won');
    sounds.play('tick');

    expect(oscillator).toHaveBeenCalledTimes(4);
  });

  it('le son du record est un arpège de quatre notes', async () => {
    const sounds = await awake();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('record');

    expect(oscillator).toHaveBeenCalledTimes(4);
  });

  it('ne sonne pas tant qu\'un clic n\'a pas réveillé le son', () => {
    const sounds = create();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('roundPassed');

    expect(oscillator).not.toHaveBeenCalled();
  });

  it('jamais pendant un extrait : le service lit lui-même le lecteur', async () => {
    const sounds = await awake();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    audio.emit('playing');
    sounds.play('tick');
    expect(oscillator).not.toHaveBeenCalled();

    audio.emit('finished');
    sounds.play('tick');
    expect(oscillator).toHaveBeenCalledTimes(1);
  });

  it('coupés par le joueur, ils ne sonnent plus, et ce navigateur s\'en souvient', async () => {
    const sounds = await awake();
    sounds.toggleMuted();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('won');

    expect(sounds.muted()).toBe(true);
    expect(oscillator).not.toHaveBeenCalled();
    expect(storage.get(SOUNDS_MUTED_KEY)).toBe('1');
    TestBed.resetTestingModule();
    expect(create().muted()).toBe(true);
  });

  it('remis, ils sonnent de nouveau et la préférence s\'efface', async () => {
    storage.set(SOUNDS_MUTED_KEY, '1');
    const sounds = await awake();

    sounds.toggleMuted();

    expect(sounds.muted()).toBe(false);
    expect(storage.get(SOUNDS_MUTED_KEY)).toBeNull();
  });

  it('ferme son contexte audio avec la page (Safari en limite le nombre)', () => {
    const sounds = create();
    sounds.unlock();
    const close = vi.spyOn(AudioContext.prototype, 'close');

    TestBed.resetTestingModule();

    expect(close).toHaveBeenCalled();
  });
});
