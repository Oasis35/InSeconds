import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { AudioPreviewPlayer, PREVIEW_AUDIO_FACTORY, PreviewAudio } from '../data-access/audio-preview.player';
import { FakeCatalogueApi, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake } from '../data-access/testing/fake-catalogue-api';
import { PreviewTrackDialog } from './preview-track.dialog';

class FakeAudio implements PreviewAudio {
  paused = true;
  currentTime = 0;
  duration = 30;
  onended: ((event: Event) => unknown) | null = null;
  readonly play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  readonly pause = vi.fn(() => { this.paused = true; });
}

describe('PreviewTrackDialog', () => {
  const track = poolTrack({ id: 7, deezerTrackId: 77, artist: 'Eminem', title: 'Lose Yourself' });
  let audios: FakeAudio[];
  let api: FakeCatalogueApi;

  function open(overrides: Partial<FakeCatalogueApi> = {}) {
    audios = [];
    api = fakeCatalogueApi(overrides);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        AudioPreviewPlayer,
        provideCatalogueApiFake(api),
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => audios[audios.push(new FakeAudio()) - 1] },
        { provide: DIALOG_DATA, useValue: track },
        { provide: DialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PreviewTrackDialog);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, player: TestBed.inject(AudioPreviewPlayer) };
  }

  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  it('annonce la recherche de l\'extrait puis lance la lecture', async () => {
    const { fixture, element, player } = open({ findPreviewUrl: vi.fn(async () => 'https://preview/77.mp3') });
    expect(element.textContent).toContain('admin.previewModal.loading');

    await flush();
    fixture.detectChanges();

    expect(api.findPreviewUrl).toHaveBeenCalledWith(track);
    expect(player.url()).toBe('https://preview/77.mp3');
    expect(player.playing()).toBe(true);
    expect(element.textContent).toContain('⏸');
  });

  it('affiche l\'artiste et le titre', () => {
    const { element } = open();

    expect(element.textContent).toContain('Eminem');
    expect(element.textContent).toContain('Lose Yourself');
  });

  it('dit qu\'il n\'y a pas d\'extrait quand Deezer n\'en renvoie aucun', async () => {
    const { fixture, element, player } = open({ findPreviewUrl: vi.fn(async () => null) });

    await flush();
    fixture.detectChanges();

    expect(element.textContent).toContain('admin.previewModal.error');
    expect(player.playing()).toBe(false);
  });

  it('dit que Deezer est indisponible quand l\'API répond 503', async () => {
    const { fixture, element } = open({
      findPreviewUrl: vi.fn(async () => Promise.reject(problem(503, 'catalogue.deezer_unavailable'))),
    });

    await flush();
    fixture.detectChanges();

    expect(element.textContent).toContain('admin.previewModal.unavailable');
  });

  it('met en pause puis reprend au clic sur le bouton de lecture', async () => {
    const { fixture, element, player } = open({ findPreviewUrl: vi.fn(async () => 'https://preview/77.mp3') });
    await flush();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('button[type="button"]:not([aria-label])')!.click();
    expect(player.playing()).toBe(false);
  });

  it('arrête le son à la fermeture', async () => {
    const { fixture, player } = open({ findPreviewUrl: vi.fn(async () => 'https://preview/77.mp3') });
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
    const { fixture, player } = open({ findPreviewUrl: vi.fn(() => new Promise<string>(resolve => { answer = resolve; })) });

    fixture.destroy();
    answer('https://preview/77.mp3');
    await flush();

    expect(audios).toHaveLength(0);
    expect(player.url()).toBeNull();
    expect(player.playing()).toBe(false);
  });

  it('ne lance rien non plus quand l\'échec arrive après la fermeture', async () => {
    let fail!: (error: unknown) => void;
    const { fixture, player } = open({ findPreviewUrl: vi.fn(() => new Promise<string>((_, reject) => { fail = reject; })) });

    fixture.destroy();
    fail(problem(503, 'catalogue.deezer_unavailable'));
    await flush();

    expect(player.playing()).toBe(false);
  });

  it('coupe l\'extrait que le panneau de recherche jouait', async () => {
    audios = [];
    api = fakeCatalogueApi({ findPreviewUrl: vi.fn(async () => 'https://preview/77.mp3') });
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), AudioPreviewPlayer, provideCatalogueApiFake(api),
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => audios[audios.push(new FakeAudio()) - 1] },
        { provide: DIALOG_DATA, useValue: track },
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
