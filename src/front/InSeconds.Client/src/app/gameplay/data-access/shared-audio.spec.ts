import { isSharedAudioUnlocked, resetSharedAudioElement, silenceWavBytes, unlockSharedAudio } from './shared-audio';

describe('shared-audio', () => {
  afterEach(() => resetSharedAudioElement());

  it('le silence du déverrouillage est un WAV', () => {
    const bytes = silenceWavBytes();

    expect(String.fromCodePoint(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCodePoint(...bytes.slice(8, 12))).toBe('WAVE');
  });

  it("déverrouille l'élément partagé dans le clic, une seule fois", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    unlockSharedAudio();
    unlockSharedAudio();

    expect(isSharedAudioUnlocked()).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('un refus du navigateur se retente au clic suivant', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('refusé', 'NotAllowedError'));

    unlockSharedAudio();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(isSharedAudioUnlocked()).toBe(false);
    unlockSharedAudio();
    expect(play).toHaveBeenCalledTimes(2);
  });
});
