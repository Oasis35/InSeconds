import { TestBed } from '@angular/core/testing';
import { FakeAudioPort, provideFakeAudio } from '../../gameplay/data-access/testing/fake-audio.port';
import { RunSounds } from './run-sounds';

describe('RunSounds', () => {
  let audio: FakeAudioPort;
  /** Les contextes audio que RunSounds crée : on les observe sans toucher à son champ privé. */
  let contexts: AudioContext[];

  const create = (): RunSounds => {
    TestBed.configureTestingModule({ providers: [RunSounds, provideFakeAudio(audio)] });
    return TestBed.inject(RunSounds);
  };

  /** Réveillé dans un clic : le contexte passe en marche (le Chromium des tests ne demande pas de geste). */
  const awake = async (): Promise<RunSounds> => {
    const sounds = create();
    sounds.unlock();
    await vi.waitFor(() => expect(contexts[0]?.state).toBe('running'));
    return sounds;
  };

  beforeEach(() => {
    audio = new FakeAudioPort();
    contexts = [];
    const Real = AudioContext;
    vi.stubGlobal('AudioContext', class extends Real {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        contexts.push(this);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it('ferme son contexte audio avec la page (Safari en limite le nombre)', () => {
    const sounds = create();
    sounds.unlock();
    const close = vi.spyOn(AudioContext.prototype, 'close');

    TestBed.resetTestingModule();

    expect(close).toHaveBeenCalled();
  });
});
