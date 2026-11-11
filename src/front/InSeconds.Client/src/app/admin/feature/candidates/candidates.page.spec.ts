import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { PreviewTrackData, PreviewTrackDialog } from '../../../core/audio-preview/preview-track.dialog';
import { AudioPreviewPlayer, PREVIEW_AUDIO_FACTORY, PreviewAudio } from '../../../core/audio-preview/audio-preview.player';
import { ModalService } from '../../../ui/modal/modal.service';
import { FakeCatalogueApi, candidate, fakeCatalogueApi, problem, provideCatalogueApiFake } from '../../data-access/testing/fake-catalogue-api';
import { Candidate } from '../../domain/candidates';
import { CandidatesPage } from './candidates.page';

class FakeAudio implements PreviewAudio {
  paused = true; currentTime = 0; duration = 30; onended = null;
  readonly play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  readonly pause = vi.fn(() => { this.paused = true; });
}

describe('CandidatesPage', () => {
  const list: Candidate[] = [
    candidate({ id: 1, deezerTrackId: 11, artist: 'Eminem', title: 'Lose Yourself', priority: 'A', rank: 900 }),
    candidate({ id: 2, deezerTrackId: 12, artist: 'Gazo', title: 'Drill FR', priority: 'B' }),
    candidate({ id: 3, deezerTrackId: 13, preview: 'missing' }),
    candidate({ id: 4, deezerTrackId: 14, isDismissed: true }),
  ];

  let api: FakeCatalogueApi;
  let modal: { open: ReturnType<typeof vi.fn> };

  async function render(overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi({ listCandidates: vi.fn(async () => list), ...overrides });
    modal = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), provideCatalogueApiFake(api),
        { provide: ModalService, useValue: modal },
        { provide: PREVIEW_AUDIO_FACTORY, useValue: () => new FakeAudio() },
      ],
    });
    const fixture = TestBed.createComponent(CandidatesPage);
    const settle = async () => { await fixture.whenStable(); await new Promise<void>(resolve => setTimeout(resolve, 0)); fixture.detectChanges(); };
    fixture.detectChanges();
    await settle();
    const el = fixture.nativeElement as HTMLElement;
    const q = <T extends HTMLElement>(testid: string) => el.querySelector<T>(`[data-testid="${testid}"]`)!;
    const rows = () => Array.from(el.querySelectorAll('[data-testid="candidate"]'));
    return { fixture, el, q, rows, settle, player: fixture.debugElement.injector.get(AudioPreviewPlayer) };
  }

  it('montre les candidats à traiter, A d\'abord, et leur nombre', async () => {
    const { rows, q } = await render();

    expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining('Lose Yourself'), expect.stringContaining('Drill FR'), expect.anything()]);
    expect(q('candidates-view-todo').textContent).toContain('admin.candidates.viewTodo');
    expect(q<HTMLButtonElement>('candidates-add').disabled).toBe(true);
  });

  it('ajoute la sélection cochée au pool, puis le dit', async () => {
    const { rows, q, settle } = await render();
    rows()[0].querySelector<HTMLInputElement>('[data-testid="candidate-check"]')!.click();
    await settle();
    expect(q<HTMLButtonElement>('candidates-add').disabled).toBe(false);

    q('candidates-add').click();
    await settle();

    expect(api.addCandidates).toHaveBeenCalledWith([1]);
    expect(q('candidates-add-result')).not.toBeNull();
  });

  it('écarte la sélection, et la remet depuis la vue des écartés', async () => {
    const { rows, q, settle } = await render();
    rows()[1].querySelector<HTMLInputElement>('[data-testid="candidate-check"]')!.click();
    await settle();
    q('candidates-dismiss').click();
    await settle();
    expect(api.dismissCandidates).toHaveBeenCalledWith([2], true);

    q('candidates-view-dismissed').click();
    await settle();
    rows()[0].querySelector<HTMLInputElement>('[data-testid="candidate-check"]')!.click();
    await settle();
    q('candidates-restore').click();
    await settle();
    expect(api.dismissCandidates).toHaveBeenLastCalledWith([4], false);
  });

  it('importe ce qui est collé, avec sa priorité, et montre le résultat', async () => {
    const { q, settle, fixture } = await render();
    const area = q<HTMLTextAreaElement>('candidates-text');
    area.value = '101 A\n102';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    q('candidates-import').click();
    await settle();

    expect(api.importCandidates).toHaveBeenCalledWith([{ deezerTrackId: 101, priority: 'A' }, { deezerTrackId: 102, priority: null }]);
    expect(q('candidates-import-result')).not.toBeNull();
  });

  it('montre l\'erreur d\'un import refusé', async () => {
    const { q, settle, fixture, el } = await render({ importCandidates: vi.fn(() => Promise.reject(problem(400, 'common.validation_failed'))) });
    const area = q<HTMLTextAreaElement>('candidates-text');
    area.value = '101';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    q('candidates-import').click();
    await settle();

    expect(el.querySelector('[data-testid="candidates-error"]')).not.toBeNull();
  });

  it('écoute un extrait tout frais dans la fenêtre d\'écoute', async () => {
    const { rows } = await render();

    rows()[0].querySelector<HTMLButtonElement>('[data-testid="candidate-listen"]')!.click();

    const [component, config] = modal.open.mock.calls[0];
    expect(component).toBe(PreviewTrackDialog);
    const data = config.data as PreviewTrackData;
    expect([data.artist, data.title]).toEqual(['Eminem', 'Lose Yourself']);
    expect(await data.loadPreviewUrl!()).toBe('https://preview/candidate.mp3');
    expect(api.candidatePreviewUrl).toHaveBeenCalledWith(1);
  });

  it('filtre par priorité', async () => {
    const { rows, q, settle } = await render();
    const select = q<HTMLSelectElement>('candidates-filter-priority');

    select.value = 'B';
    select.dispatchEvent(new Event('change'));
    await settle();

    expect(rows()).toHaveLength(1);
  });

  it('dit que le sas est vide', async () => {
    const { q } = await render({ listCandidates: vi.fn(async () => []) });

    expect(q('candidates-empty')).not.toBeNull();
  });
});
