import { TestBed } from '@angular/core/testing';
import { AudioPreviewPlayer, PREVIEW_AUDIO_FACTORY, PreviewAudio } from './audio-preview.player';

class FakeAudio implements PreviewAudio {
  paused = true;
  currentTime = 0;
  duration = 30;
  onended: ((event: Event) => unknown) | null = null;
  readonly play = vi.fn<() => Promise<void>>(() => { this.paused = false; return Promise.resolve(); });
  readonly pause = vi.fn(() => { this.paused = true; });
  constructor(readonly url: string) {}
}

describe('AudioPreviewPlayer', () => {
  let created: FakeAudio[];
  let player: AudioPreviewPlayer;
  let frames: FrameRequestCallback[];
  /** Comportement de  du prochain extrait créé (par défaut : la lecture démarre). */
  let nextPlay: (() => Promise<void>) | null;

  beforeEach(() => {
    created = [];
    frames = [];
    nextPlay = null;
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        AudioPreviewPlayer,
        {
          provide: PREVIEW_AUDIO_FACTORY,
          useValue: (url: string) => {
            const audio = new FakeAudio(url);
            if (nextPlay) audio.play.mockImplementationOnce(nextPlay);
            created.push(audio);
            return audio;
          },
        },
      ],
    });
    player = TestBed.inject(AudioPreviewPlayer);
  });

  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  it('ne fait rien sans adresse', () => {
    player.toggle(null);
    player.toggle(undefined);
    player.toggle('');

    expect(created).toHaveLength(0);
    expect(player.playing()).toBe(false);
  });

  it('joue un extrait', async () => {
    player.toggle('http://preview/1.mp3');
    await flush();

    expect(created[0].play).toHaveBeenCalledTimes(1);
    expect(player.url()).toBe('http://preview/1.mp3');
    expect(player.playing()).toBe(true);
  });

  it('met en pause puis reprend le même extrait sans le recharger', async () => {
    player.toggle('http://preview/1.mp3');
    await flush();

    player.toggle('http://preview/1.mp3');
    expect(player.playing()).toBe(false);
    expect(created[0].pause).toHaveBeenCalled();

    player.toggle('http://preview/1.mp3');
    await flush();
    expect(created).toHaveLength(1);
    expect(created[0].play).toHaveBeenCalledTimes(2);
    expect(player.playing()).toBe(true);
  });

  it('écouter un autre extrait coupe le premier', async () => {
    player.toggle('http://preview/1.mp3');
    await flush();

    player.toggle('http://preview/2.mp3');
    await flush();

    expect(created[0].pause).toHaveBeenCalled();
    expect(player.url()).toBe('http://preview/2.mp3');
    expect(player.playing()).toBe(true);
  });

  it('suit l\'avancement de la lecture', async () => {
    player.toggle('http://preview/1.mp3');
    await flush();

    created[0].currentTime = 15;
    frames.at(-1)?.(0);

    expect(player.progress()).toBe(50);
  });

  it('s\'arrête à la fin de l\'extrait', async () => {
    player.toggle('http://preview/1.mp3');
    await flush();

    created[0].onended?.(new Event('ended'));

    expect(player.playing()).toBe(false);
    expect(player.progress()).toBe(100);
  });

  it('libère tout à l\'arrêt', async () => {
    player.toggle('http://preview/1.mp3');
    await flush();

    player.stop();

    expect(created[0].pause).toHaveBeenCalled();
    expect(created[0].onended).toBeNull();
    expect(player.url()).toBeNull();
    expect(player.playing()).toBe(false);
    expect(player.progress()).toBe(0);
  });

  it('revient au repos si la lecture est refusée', async () => {
    nextPlay = () => Promise.reject(new Error('NotAllowedError'));

    player.toggle('http://preview/1.mp3');
    await flush();

    expect(player.playing()).toBe(false);
    expect(player.url()).toBeNull();
  });

  it('ignore la promesse d\'une lecture arrêtée entre-temps', async () => {
    let release!: () => void;
    nextPlay = () => new Promise<void>(resolve => { release = resolve; });
    player.toggle('http://preview/1.mp3');

    player.stop();
    release();
    await flush();

    expect(player.playing()).toBe(false);
    expect(player.url()).toBeNull();
  });
});
