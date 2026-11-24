import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { PreviewTrackDialog } from '../../../../core/audio-preview/preview-track.dialog';
import { ModalService } from '../../../../ui/modal/modal.service';
import { PoolStore } from '../../../data-access/pool.store';
import { FakeCatalogueApi, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake } from '../../../data-access/testing/fake-catalogue-api';
import { fakeCooldownApi, provideCooldownApiFake } from '../../../data-access/testing/fake-cooldown-api';
import { DeezerResult } from '../../../domain/pool-track';
import { ReplaceTrackDialog } from './replace-track.dialog';

describe('ReplaceTrackDialog', () => {
  const track = poolTrack({ id: 645, deezerTrackId: 3098519, artist: 'Queen', title: 'Under Pressure', preview: 'missing' });
  const version: DeezerResult = { deezerTrackId: 4091932171, artist: 'Queen', title: 'Under Pressure (feat. David Bowie)', previewUrl: 'https://preview/a.mp3' };
  let api: FakeCatalogueApi;
  let dialog: { close: ReturnType<typeof vi.fn> };
  let modal: { open: ReturnType<typeof vi.fn> };

  function open(overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi({ findReplacements: vi.fn(async () => [version]), ...overrides });
    dialog = { close: vi.fn() };
    modal = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), PoolStore, provideCatalogueApiFake(api), provideCooldownApiFake(fakeCooldownApi()),
        { provide: DIALOG_DATA, useValue: track },
        { provide: DialogRef, useValue: dialog },
        { provide: ModalService, useValue: modal },
      ],
    });
    const fixture = TestBed.createComponent(ReplaceTrackDialog);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  it('cherche les autres versions du morceau et les liste', async () => {
    const { fixture, element } = open();
    await settle(fixture);

    expect(api.findReplacements).toHaveBeenCalledWith(expect.objectContaining({ id: 645, deezerTrackId: 3098519 }));
    expect(element.querySelectorAll('[data-testid="replace-candidates"] li')).toHaveLength(1);
    expect(element.textContent).toContain('Under Pressure (feat. David Bowie)');
  });

  it('dit quand Deezer n\'a aucune autre version avec extrait', async () => {
    const { fixture, element } = open({ findReplacements: vi.fn(async () => []) });
    await settle(fixture);

    expect(element.querySelector('[data-testid="replace-empty"]')).not.toBeNull();
  });

  it('dit quand Deezer n\'a pas répondu', async () => {
    const { fixture, element } = open({ findReplacements: vi.fn(async () => { throw new Error('boom'); }) });
    await settle(fixture);

    expect(element.querySelector('[data-testid="replace-search-error"]')).not.toBeNull();
  });

  it('écoute une version avec la fenêtre d\'écoute, l\'extrait déjà reçu', async () => {
    const { fixture, element } = open();
    await settle(fixture);

    element.querySelector<HTMLButtonElement>('[data-testid="replace-candidates"] li button')!.click();

    expect(modal.open).toHaveBeenCalledWith(PreviewTrackDialog, expect.objectContaining({ data: version }));
  });

  it('remplace le morceau par la version choisie, relit le pool et ferme', async () => {
    const { fixture, element } = open();
    await settle(fixture);

    element.querySelector<HTMLButtonElement>('[data-testid="replace-choose"]')!.click();
    await settle(fixture);

    expect(api.replaceSource).toHaveBeenCalledWith(645, 4091932171);
    expect(api.listTracks).toHaveBeenCalled();
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('reste ouverte avec l\'erreur de l\'API quand le remplacement est refusé', async () => {
    const { fixture, element } = open({ replaceSource: vi.fn(async () => { throw problem(409, 'catalogue.track_in_use'); }) });
    await settle(fixture);

    element.querySelector<HTMLButtonElement>('[data-testid="replace-choose"]')!.click();
    await settle(fixture);

    expect(dialog.close).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="replace-error"]')?.textContent).toContain('errors.catalogue.track_in_use');
  });
});
