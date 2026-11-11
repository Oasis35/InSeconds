import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { AudioPreviewPlayer, PREVIEW_AUDIO_FACTORY, PreviewAudio } from '../../../core/audio-preview/audio-preview.player';
import { PreviewTrackDialog } from '../../../core/audio-preview/preview-track.dialog';
import { FileDownload } from '../../../core/download/file-download';
import { ModalService } from '../../../ui/modal/modal.service';
import { FakeCatalogueApi, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake } from '../../data-access/testing/fake-catalogue-api';
import { fakeCooldownApi, provideCooldownApiFake } from '../../data-access/testing/fake-cooldown-api';
import { PoolTheme, PoolTrack } from '../../domain/pool-track';
import { ThemesPage } from './themes.page';
import { stubContentTabs } from '../../ui/content-tabs/testing/content-tabs.stub';

class FakeAudio implements PreviewAudio {
  paused = true; currentTime = 0; duration = 30; onended = null;
  readonly play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  readonly pause = vi.fn(() => { this.paused = true; });
}

describe('ThemesPage', () => {
  const themes: PoolTheme[] = [{ id: 1, name: 'Années 80', trackCount: 2, icon: null }, { id: 2, name: 'Films', trackCount: 0, icon: null }];
  const aha = poolTrack({ id: 1, deezerTrackId: 11, artist: 'a-ha', title: 'Take On Me', themeIds: [1, 2] });
  const toto = poolTrack({ id: 2, deezerTrackId: 12, artist: 'Toto', title: 'Africa', themeIds: [1] });
  const eminem = poolTrack({ id: 3, deezerTrackId: 13, artist: 'Eminem', title: 'Lose Yourself' });

  let api: FakeCatalogueApi;
  let modal: { open: ReturnType<typeof vi.fn> };
  let download: { saveText: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  async function render(options: { query?: Record<string, string>; api?: Partial<FakeCatalogueApi>; tracks?: PoolTrack[] } = {}) {
    api = fakeCatalogueApi({
      listTracks: vi.fn(async () => options.tracks ?? [aha, toto, eminem]), listThemes: vi.fn(async () => themes), ...options.api,
    });
    modal = { open: vi.fn() };
    download = { saveText: vi.fn() };
    router = { navigate: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideCatalogueApiFake(api), provideCooldownApiFake(fakeCooldownApi()),
        { provide: ModalService, useValue: modal },
        { provide: FileDownload, useValue: download },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) } } },
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => new FakeAudio() },
      ],
    });
    stubContentTabs(ThemesPage);
    const fixture = TestBed.createComponent(ThemesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const settle = async () => { await fixture.whenStable(); await new Promise<void>(resolve => setTimeout(resolve, 0)); fixture.detectChanges(); };
    return { fixture, element, settle, player: fixture.debugElement.injector.get(AudioPreviewPlayer) };
  }

  it('compte les morceaux de chaque thème d\'après le pool', async () => {
    const { element } = await render();

    const cards = Array.from(element.querySelectorAll('[data-testid="theme-card"]'));
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Années 80');
  });

  it('ouvre le thème de l\'adresse (?theme=) avec ses morceaux', async () => {
    const { element } = await render({ query: { theme: '1' } });

    expect(element.querySelectorAll('[data-testid="theme-track"]')).toHaveLength(2);
    expect(element.querySelector('[data-testid="theme-panel"]')?.textContent).toContain('Années 80');
  });

  it('un thème inconnu dans l\'adresse n\'ouvre rien', async () => {
    const { element } = await render({ query: { theme: '99' } });

    expect(element.querySelector('[data-testid="theme-track"]')).toBeNull();
  });

  it('change l\'icône du thème ouvert depuis le sélecteur, puis revient au détail', async () => {
    const { element, settle } = await render({ query: { theme: '1' } });

    (element.querySelector('[data-testid="theme-icon-open"]') as HTMLElement).click();
    await settle();
    expect(element.querySelector('[data-testid="theme-icon-picker"]')).not.toBeNull();

    (element.querySelector('[data-testid="theme-icon-option"][aria-label="guitar"]') as HTMLElement).click();
    await settle();
    (element.querySelector('[data-testid="theme-icon-save"]') as HTMLElement).click();
    await settle();

    expect(api.setThemeIcon).toHaveBeenCalledWith(1, 'guitar');
    expect(element.querySelector('[data-testid="theme-icon-picker"]')).toBeNull();
    expect(element.querySelector('[data-testid="theme-add-open"]')).not.toBeNull();
  });

  it('« Sans icône » retire l\'icône', async () => {
    const { element, settle } = await render({ query: { theme: '1' } });

    (element.querySelector('[data-testid="theme-icon-open"]') as HTMLElement).click();
    await settle();
    (element.querySelector('[data-testid="theme-icon-clear"]') as HTMLElement).click();
    await settle();

    expect(api.setThemeIcon).toHaveBeenCalledWith(1, null);
  });

  it('une erreur à l\'enregistrement de l\'icône s\'affiche dans le sélecteur, qui reste ouvert', async () => {
    const { element, settle } = await render({ query: { theme: '1' }, api: { setThemeIcon: vi.fn(async () => { throw problem(404, 'catalogue.theme_not_found'); }) } });

    (element.querySelector('[data-testid="theme-icon-open"]') as HTMLElement).click();
    await settle();
    (element.querySelector('[data-testid="theme-icon-clear"]') as HTMLElement).click();
    await settle();

    expect(element.querySelector('[data-testid="theme-icon-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="theme-icon-picker"]')).not.toBeNull();
  });

  it('retire un morceau du thème sans le sortir du pool', async () => {
    const { element, settle } = await render({ query: { theme: '1' } });

    element.querySelectorAll<HTMLButtonElement>('[data-testid="theme-track-remove"]')[0].click();
    await settle();

    // Les morceaux sont triés par titre : « Africa » (id 2) est le premier.
    expect(api.setTrackThemes).toHaveBeenCalledWith(2, []);
    expect(api.deleteTrack).not.toHaveBeenCalled();
  });

  it('ouvre la fenêtre d\'écoute du pool avec le ▶ d\'un morceau', async () => {
    const { element } = await render({ query: { theme: '1' } });

    element.querySelector<HTMLButtonElement>('[data-testid="theme-track"] button')!.click();

    expect(modal.open).toHaveBeenCalledWith(PreviewTrackDialog, expect.objectContaining({ data: expect.objectContaining({ artist: 'Toto' }) }));
  });

  it('ajoute des morceaux du pool au thème puis referme le panneau d\'ajout', async () => {
    const { element, fixture, settle } = await render({ query: { theme: '2' } });

    element.querySelector<HTMLButtonElement>('[data-testid="theme-add-open"]')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLInputElement>('[data-testid="theme-candidate"] input')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="theme-add-submit"]')!.click();
    await settle();

    expect(api.assignTracksToThemes).toHaveBeenCalledTimes(1);
    expect(element.querySelector('[data-testid="theme-add-submit"]')).toBeNull();
  });

  it('crée un thème et l\'ouvre', async () => {
    const created: PoolTheme[] = [...themes];
    const { element, fixture, settle } = await render({
      api: {
        listThemes: vi.fn(async () => created),
        addTheme: vi.fn(async (name: string) => { created.push({ id: 7, name, trackCount: 0, icon: null }); }),
      },
    });

    const input = element.querySelector<HTMLInputElement>('[data-testid="theme-new"]')!;
    input.value = 'Jazz';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();

    expect(api.addTheme).toHaveBeenCalledWith('Jazz');
    expect(element.querySelector('[data-testid="theme-panel"]')?.textContent).toContain('Jazz');
  });

  it('affiche l\'erreur d\'un nom déjà pris sous la liste', async () => {
    const { element, fixture, settle } = await render({ api: { addTheme: vi.fn(() => Promise.reject(problem(409, 'catalogue.theme_name_taken'))) } });

    const input = element.querySelector<HTMLInputElement>('[data-testid="theme-new"]')!;
    input.value = 'Films';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();

    expect(element.querySelector('[data-testid="themes-error"]')).not.toBeNull();
  });

  it('supprime un thème vide et referme le détail', async () => {
    const { element, settle } = await render({ query: { theme: '2' }, tracks: [eminem] });

    element.querySelector<HTMLButtonElement>('[data-testid="theme-delete"]')!.click();
    await settle();

    expect(api.deleteTheme).toHaveBeenCalledWith(2);
    expect(element.querySelector('[data-testid="theme-track"]')).toBeNull();
  });

  it('exporte le pool en CSV avec les thèmes de chaque morceau', async () => {
    const { element } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="themes-export"]')!.click();

    const [name, text] = download.saveText.mock.calls[0] as [string, string];
    expect(name).toBe('inseconds-pool.csv');
    expect(text).toContain('1;a-ha;Take On Me;;;Années 80 / Films');
  });

  it('importe un classement après l\'aperçu, en une seule requête', async () => {
    const { element, fixture, settle } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="themes-import"]')!.click();
    fixture.detectChanges();
    const area = element.querySelector<HTMLTextAreaElement>('[data-testid="import-text"]')!;
    area.value = 'Films ; 2\nFilms ; 3';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="import-preview"]')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="import-apply"]')!.click();
    await settle();

    expect(api.assignTracksToThemes).toHaveBeenCalledWith([{ themeId: 2, trackIds: [2, 3] }]);
    expect(element.querySelector('[data-testid="import-result"]')).not.toBeNull();
  });

  it('un classement refusé garde l\'aperçu et affiche l\'erreur', async () => {
    const { element, fixture, settle } = await render({ api: { assignTracksToThemes: vi.fn(() => Promise.reject(problem(404, 'catalogue.theme_not_found'))) } });

    element.querySelector<HTMLButtonElement>('[data-testid="themes-import"]')!.click();
    fixture.detectChanges();
    const area = element.querySelector<HTMLTextAreaElement>('[data-testid="import-text"]')!;
    area.value = 'Films ; 3';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="import-preview"]')!.click();
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('[data-testid="import-apply"]')!.click();
    await settle();

    expect(element.querySelector('[data-testid="import-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="import-result"]')).toBeNull();
  });
});
