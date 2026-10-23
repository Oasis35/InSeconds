import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { AudioPreviewPlayer, PREVIEW_AUDIO_FACTORY, PreviewAudio } from './audio-preview.player';
import { PreviewTrackData, PreviewTrackDialog } from './preview-track.dialog';

/** Erreur telle que la lève le client NSwag quand l'API répond par un `ProblemDetails` (cf. `toAppError`). */
const problem = (status: number, code: string) => ({ status, code, traceId: '0123456789abcdef0123456789abcdef' });

class FakeAudio implements PreviewAudio {
  paused = true;
  currentTime = 0;
  duration = 30;
  onended: ((event: Event) => unknown) | null = null;
  readonly play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  readonly pause = vi.fn(() => { this.paused = true; });
}

describe('PreviewTrackDialog', () => {
  let audios: FakeAudio[];
  let load: ReturnType<typeof vi.fn<() => Promise<string | null>>>;

  /** Un morceau dont l'extrait est à demander, par `loader` (une adresse par défaut). */
  function open(loader: () => Promise<string | null> = async () => 'https://preview/77.mp3', data?: PreviewTrackData) {
    audios = [];
    load = vi.fn(loader);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        AudioPreviewPlayer,
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => audios[audios.push(new FakeAudio()) - 1] },
        { provide: DIALOG_DATA, useValue: data ?? { artist: 'Eminem', title: 'Lose Yourself', loadPreviewUrl: load } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PreviewTrackDialog);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, player: TestBed.inject(AudioPreviewPlayer) };
  }

  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  it('annonce la recherche de l\'extrait puis lance la lecture', async () => {
    const { fixture, element, player } = open();
    expect(element.textContent).toContain('common.previewModal.loading');

    await flush();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledOnce();
    expect(player.url()).toBe('https://preview/77.mp3');
    expect(player.playing()).toBe(true);
    expect(element.textContent).toContain('⏸');
  });

  it('lit tout de suite l\'extrait d\'un résultat de la recherche Deezer, sans le redemander', async () => {
    const result = { artist: 'Daft Punk', title: 'Veridis Quo', previewUrl: 'https://preview/42.mp3', loadPreviewUrl: () => load() };
    const { fixture, element, player } = open(undefined, result);
    await flush();
    fixture.detectChanges();

    expect(load).not.toHaveBeenCalled();
    expect(player.url()).toBe('https://preview/42.mp3');
    expect(player.playing()).toBe(true);
    expect(element.textContent).toContain('Daft Punk');
  });

  it('dit qu\'il n\'y a pas d\'extrait pour un résultat Deezer qui n\'en a pas', async () => {
    const { fixture, element } = open(undefined, { artist: 'Daft Punk', title: 'Veridis Quo', previewUrl: null, loadPreviewUrl: () => load() });
    await flush();
    fixture.detectChanges();

    expect(load).not.toHaveBeenCalled();
    expect(element.textContent).toContain('common.previewModal.error');
  });

  it('affiche l\'artiste et le titre', () => {
    const { element } = open();

    expect(element.textContent).toContain('Eminem');
    expect(element.textContent).toContain('Lose Yourself');
  });

  it('dit qu\'il n\'y a pas d\'extrait quand Deezer n\'en renvoie aucun', async () => {
    const { fixture, element, player } = open(async () => null);

    await flush();
    fixture.detectChanges();

    expect(element.textContent).toContain('common.previewModal.error');
    expect(player.playing()).toBe(false);
  });

  it('dit que Deezer est indisponible quand l\'API répond 503', async () => {
    const { fixture, element } = open(async () => Promise.reject(problem(503, 'catalogue.deezer_unavailable')));

    await flush();
    fixture.detectChanges();

    expect(element.textContent).toContain('common.previewModal.unavailable');
  });

  it('met en pause puis reprend au clic sur le bouton de lecture', async () => {
    const { fixture, element, player } = open();
    await flush();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('[data-testid=preview-toggle]')!.click();
    expect(player.playing()).toBe(false);
  });

  it('arrête le son à la fermeture', async () => {
    const { fixture, player } = open();
    await flush();
    expect(player.playing()).toBe(true);

    fixture.destroy();

    expect(player.playing()).toBe(false);
    expect(audios[0].pause).toHaveBeenCalled();
  });

  // Piège 42 : la recherche de l'extrait passe par Deezer et peut être lente ; sa réponse, arrivée
  // après la fermeture de la fenêtre, relançait l'audio d'une fenêtre fermée.
  it('ne lance rien quand la réponse de Deezer arrive après la fermeture', async () => {
    let answer!: (url: string) => void;
    const { fixture, player } = open(() => new Promise<string>(resolve => { answer = resolve; }));

    fixture.destroy();
    answer('https://preview/77.mp3');
    await flush();

    expect(audios).toHaveLength(0);
    expect(player.url()).toBeNull();
    expect(player.playing()).toBe(false);
  });

  it('ne lance rien non plus quand l\'échec arrive après la fermeture', async () => {
    let fail!: (error: unknown) => void;
    const { fixture, player } = open(() => new Promise<string>((_, reject) => { fail = reject; }));

    fixture.destroy();
    fail(problem(503, 'catalogue.deezer_unavailable'));
    await flush();

    expect(player.playing()).toBe(false);
  });

  it('coupe l\'extrait qui jouait encore', async () => {
    audios = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), AudioPreviewPlayer,
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => audios[audios.push(new FakeAudio()) - 1] },
        { provide: DIALOG_DATA, useValue: { artist: 'Eminem', title: 'Lose Yourself', loadPreviewUrl: async () => 'https://preview/77.mp3' } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const player = TestBed.inject(AudioPreviewPlayer);
    player.toggle('https://search/1.mp3');
    await flush();
    expect(player.playing()).toBe(true);

    TestBed.createComponent(PreviewTrackDialog).detectChanges();

    expect(audios[0].pause).toHaveBeenCalled();
    expect(player.url()).toBeNull();
  });
});
