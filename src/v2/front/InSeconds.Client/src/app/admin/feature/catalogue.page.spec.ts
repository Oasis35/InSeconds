import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ModalService } from '../../ui/modal/modal.service';
import { AudioPreviewPlayer, PREVIEW_AUDIO_FACTORY, PreviewAudio } from '../data-access/audio-preview.player';
import { DeezerSearchStore } from '../data-access/deezer-search.store';
import { PoolStore } from '../data-access/pool.store';
import {
  FakeCatalogueApi, deezerResult, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake,
} from '../data-access/testing/fake-catalogue-api';
import { PoolTrack } from '../domain/pool-track';
import { CataloguePage } from './catalogue.page';
import { EditTrackDialog } from './edit-track.dialog';
import { DeleteTrackDialog } from './delete-track.dialog';
import { PreviewTrackDialog } from './preview-track.dialog';

class FakeAudio implements PreviewAudio {
  paused = true; currentTime = 0; duration = 30; onended = null;
  readonly play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  readonly pause = vi.fn(() => { this.paused = true; });
}

describe('CataloguePage', () => {
  const eminem = poolTrack({ id: 1, deezerTrackId: 11, artist: 'Eminem', title: 'Lose Yourself', usageCount: 1, inTodayChallenge: true });
  const sabrina = poolTrack({ id: 2, deezerTrackId: 12, artist: 'Sabrina Carpenter', title: 'Espresso' });
  const nicki = poolTrack({ id: 3, deezerTrackId: 13, artist: 'Nicki Minaj', title: 'Starships' });

  let api: FakeCatalogueApi;
  let modal: { open: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  async function render(options: { tracks?: PoolTrack[]; query?: Record<string, string>; api?: Partial<FakeCatalogueApi> } = {}) {
    api = fakeCatalogueApi({ listTracks: vi.fn(async () => options.tracks ?? [eminem, sabrina, nicki]), ...options.api });
    modal = { open: vi.fn() };
    router = { navigate: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideCatalogueApiFake(api),
        { provide: ModalService, useValue: modal },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(options.query ?? {}) } } },
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => new FakeAudio() },
      ],
    });
    const fixture = TestBed.createComponent(CataloguePage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    const injector = fixture.debugElement.injector;
    const element = fixture.nativeElement as HTMLElement;
    const click = (predicate: (b: HTMLButtonElement) => boolean) =>
      (Array.from(element.querySelectorAll('button')).find(predicate) as HTMLButtonElement).click();
    return {
      fixture, element, click,
      pool: injector.get(PoolStore), search: injector.get(DeezerSearchStore), player: injector.get(AudioPreviewPlayer),
      detect: async () => { await fixture.whenStable(); fixture.detectChanges(); },
    };
  }

  it('charge le pool au démarrage et l\'affiche', async () => {
    const { element, pool } = await render();

    expect(api.listTracks).toHaveBeenCalledTimes(1);
    expect(pool.tracks()).toHaveLength(3);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(3);
  });

  it('affiche l\'erreur de chargement avec son code', async () => {
    const { element } = await render({ api: { listTracks: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected', 'trace-1'))) } });

    expect(element.querySelector('app-error-message')?.textContent).toContain('errors.common.unexpected');
    expect(element.querySelector('app-error-message')?.textContent).toContain('trace-1');
  });

  it('un chargement en échec n\'annonce pas un pool vide', async () => {
    const { element } = await render({ api: { listTracks: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) } });

    expect(element.querySelector('app-pool-table')).toBeNull();
    expect(element.textContent).not.toContain('admin.pool.empty');
  });

  describe('page de la grille dans l\'adresse', () => {
    const many = Array.from({ length: 40 }, (_, i) => poolTrack({ id: i + 1, deezerTrackId: i + 100, artist: `Artiste ${i}` }));

    it('reprend ?page= (à partir de 1) au chargement', async () => {
      const { pool } = await render({ tracks: many, query: { page: '2' } });

      expect(pool.page()).toBe(1);
    });

    it('écrit la page dans l\'adresse une fois le pool chargé, sans empiler l\'historique', async () => {
      const { pool, detect } = await render({ tracks: many, query: { page: '2' } });
      await detect();

      expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
        queryParams: { page: 2 }, queryParamsHandling: 'merge', replaceUrl: true,
      }));
      pool.previousPage();
      await detect();
      expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { page: null } }));
    });

    it('ignore une page invalide de l\'adresse', async () => {
      const { pool } = await render({ tracks: many, query: { page: 'abc' } });

      expect(pool.page()).toBe(0);
    });
  });

  describe('recherche et filtre liés', () => {
    it('restent indépendants par défaut', async () => {
      const { pool, search } = await render();

      pool.setText('eminem');
      expect(search.query()).toBe('');
    });

    it('liés, taper dans le filtre du tableau remplit la recherche Deezer, et inversement', async () => {
      const { element, click, pool, search, detect } = await render();
      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      await detect();
      click(b => b.textContent?.includes('admin.addPanel.unlinked') ?? false);
      await detect();
      const filter = element.querySelector<HTMLInputElement>('#pool-filter-text')!;
      const query = element.querySelector<HTMLInputElement>('app-search-panel input')!;

      filter.value = 'nicki minaj';
      filter.dispatchEvent(new Event('input'));
      expect(search.query()).toBe('nicki minaj');

      query.value = 'eminem';
      query.dispatchEvent(new Event('input'));
      expect(pool.filters().text).toBe('eminem');
    });

    it('liés mais panneau fermé, le filtre ne lance aucune recherche chez Deezer, et la réouverture reprend son texte', async () => {
      const { element, click, search, detect } = await render();
      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      await detect();
      click(b => b.textContent?.includes('admin.addPanel.unlinked') ?? false);
      click(b => b.textContent?.includes('admin.pool.close') ?? false);
      await detect();

      const filter = element.querySelector<HTMLInputElement>('#pool-filter-text')!;
      filter.value = 'nicki minaj';
      filter.dispatchEvent(new Event('input'));
      expect(search.query()).toBe('');

      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      expect(search.query()).toBe('nicki minaj');
    });

    it('en se liant, la recherche reprend le texte déjà tapé dans le filtre', async () => {
      const { pool, search, click, detect } = await render();
      pool.setText('queen');
      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      await detect();

      click(b => b.textContent?.includes('admin.addPanel.unlinked') ?? false);

      expect(search.linked()).toBe(true);
      expect(search.query()).toBe('queen');
    });
  });

  describe('panneau d\'ajout', () => {
    it('s\'ouvre au-dessus du tableau, qui reste visible', async () => {
      const { element, click, detect } = await render();

      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      await detect();

      expect(element.querySelector('app-search-panel')).not.toBeNull();
      expect(element.querySelectorAll('tbody tr')).toHaveLength(3);
    });

    it('en se fermant, coupe l\'extrait écouté', async () => {
      const { click, player, search, detect } = await render();
      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      await detect();
      player.toggle('http://preview/1.mp3');
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(player.playing()).toBe(true);

      click(b => b.textContent?.includes('admin.pool.close') ?? false);

      expect(search.open()).toBe(false);
      expect(player.playing()).toBe(false);
      expect(player.url()).toBeNull();
    });

    it('ajoute un résultat sans refermer le panneau, et le morceau rejoint le tableau', async () => {
      const added = poolTrack({ id: 9, deezerTrackId: 42, artist: 'E2E Artist', title: 'E2E Track' });
      const { element, click, search, detect } = await render({
        api: { searchDeezer: vi.fn(async () => [deezerResult()]) },
      });
      api.listTracks.mockResolvedValueOnce([eminem, sabrina, nicki]).mockResolvedValue([eminem, sabrina, nicki, added]);
      click(b => b.textContent?.includes('admin.pool.add') ?? false);
      search.setQuery('E2E Track');
      await new Promise<void>(resolve => setTimeout(resolve, 400));
      await detect();

      click(b => b.textContent?.trim() === 'admin.addPanel.addTrack');
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await detect();

      expect(api.addTrack).toHaveBeenCalledWith(42);
      expect(search.open()).toBe(true);
      expect(element.textContent).toContain('E2E Artist');
    });
  });

  describe('fenêtres', () => {
    it('ouvre l\'écoute, le renommage et la suppression avec l\'injecteur de la page', async () => {
      const { element, fixture } = await render();
      const row = element.querySelectorAll('tbody tr')[0] as HTMLElement; // Sabrina : les disponibles passent avant les utilisés
      const button = (text: string) => Array.from(row.querySelectorAll('button')).find(b => b.textContent?.trim() === text)!;

      button('▶').click();
      button('✎').click();
      button('🗑').click();

      const [listen, edit, remove] = modal.open.mock.calls;
      expect(listen[0]).toBe(PreviewTrackDialog);
      expect(edit[0]).toBe(EditTrackDialog);
      expect(remove[0]).toBe(DeleteTrackDialog);
      expect(edit[1].data).toEqual(expect.objectContaining({ id: 2 }));
      expect(remove[1].data).toEqual([expect.objectContaining({ id: 2 })]);
      // Les fenêtres retrouvent les stores de la page : leur injecteur est celui de la page.
      const store = fixture.debugElement.injector.get(PoolStore);
      for (const [, options] of modal.open.mock.calls) expect(options.injector.get(PoolStore)).toBe(store);
    });

    it('supprime la sélection par la barre d\'outils', async () => {
      const { pool, click, detect } = await render();
      pool.toggleSelection(2);
      pool.toggleSelection(3);
      await detect();

      click(b => b.textContent?.includes('admin.pool.delete') ?? false);

      expect(modal.open).toHaveBeenCalledTimes(1);
      expect(modal.open.mock.calls[0][1].data.map((t: PoolTrack) => t.id)).toEqual([2, 3]);
    });

    it('ne supprime pas une sélection qui contient un morceau utilisé', async () => {
      const { pool, element, detect } = await render();
      pool.toggleSelection(1);
      pool.toggleSelection(2);
      await detect();

      const button = Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.pool.delete'))!;
      expect(button.disabled).toBe(true);
      button.click();
      expect(modal.open).not.toHaveBeenCalled();
    });
  });

  describe('désactivation', () => {
    it('montre pourquoi une désactivation est refusée, puis l\'efface seule', async () => {
      const used = poolTrack({ id: 5, deezerTrackId: 55, usageCount: 2 });
      const { fixture, element } = await render({
        tracks: [used],
        api: { setTrackDisabled: vi.fn(async () => Promise.reject(problem(409, 'catalogue.track_in_today_challenge'))) },
      });
      vi.useFakeTimers();
      try {
        const disable = Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.pool.disable'))!;

        disable.click();
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();
        expect(element.querySelector('[role="alert"]')?.textContent).toContain('admin.pool.disableInTodayError');

        await vi.advanceTimersByTimeAsync(4000);
        fixture.detectChanges();
        expect(element.querySelector('[role="alert"]')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
