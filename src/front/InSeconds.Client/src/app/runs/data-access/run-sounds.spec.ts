import { TestBed } from '@angular/core/testing';
import { RunSounds } from './run-sounds';

describe('RunSounds', () => {
  const create = (): RunSounds => {
    TestBed.configureTestingModule({ providers: [RunSounds] });
    return TestBed.inject(RunSounds);
  };

  afterEach(() => {
    localStorage.removeItem('runs.sounds.muted');
    vi.restoreAllMocks();
  });

  it('ne sonne pas tant qu\'un clic n\'a pas réveillé le son', () => {
    const sounds = create();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('roundPassed');

    expect(oscillator).not.toHaveBeenCalled();
  });

  it('réveillé dans un clic, chaque son se joue sans rien casser', () => {
    const sounds = create();
    sounds.unlock();

    for (const sound of ['tick', 'roundPassed', 'cardTaken', 'won', 'lost'] as const) expect(() => sounds.play(sound)).not.toThrow();
  });

  it('jamais pendant un extrait', async () => {
    const sounds = create();
    sounds.unlock();
    await new Promise(resolve => setTimeout(resolve, 0));
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('cardTaken', true);

    expect(oscillator).not.toHaveBeenCalled();
  });

  it('coupés par le joueur, ils ne sonnent plus, et ce navigateur s\'en souvient', async () => {
    const sounds = create();
    sounds.unlock();
    await new Promise(resolve => setTimeout(resolve, 0));
    sounds.toggleMuted();
    const oscillator = vi.spyOn(AudioContext.prototype, 'createOscillator');

    sounds.play('won');

    expect(sounds.muted()).toBe(true);
    expect(oscillator).not.toHaveBeenCalled();
    expect(localStorage.getItem('runs.sounds.muted')).toBe('1');
    TestBed.resetTestingModule();
    expect(create().muted()).toBe(true);
  });

  it('ferme son contexte audio avec la page (Safari en limite le nombre)', () => {
    const sounds = create();
    sounds.unlock();
    const close = vi.spyOn(AudioContext.prototype, 'close');

    TestBed.resetTestingModule();

    expect(close).toHaveBeenCalled();
  });
});
