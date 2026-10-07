import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { PoolStore } from '../data-access/pool.store';
import { FakeCatalogueApi, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake } from '../data-access/testing/fake-catalogue-api';
import { PoolTrack } from '../domain/pool-track';
import { DeleteTrackDialog } from './delete-track.dialog';

describe('DeleteTrackDialog', () => {
  const sabrina = poolTrack({ id: 2, artist: 'Sabrina Carpenter', title: 'Espresso' });
  const nicki = poolTrack({ id: 3, artist: 'Nicki Minaj', title: 'Starships' });
  let api: FakeCatalogueApi;
  let dialog: { close: ReturnType<typeof vi.fn> };

  function open(tracks: PoolTrack[], overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi(overrides);
    dialog = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), PoolStore, provideCatalogueApiFake(api),
        { provide: DIALOG_DATA, useValue: tracks },
        { provide: DialogRef, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(DeleteTrackDialog);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button[appButton]'));
    return { fixture, element, cancel: buttons[0], confirm: buttons[1] };
  }

  const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  it('nomme le morceau à supprimer', () => {
    const { element } = open([sabrina]);

    expect(element.textContent).toContain('admin.deleteModal.single');
    expect(element.querySelector('ul')).toBeNull();
  });

  it('liste les morceaux d\'une suppression groupée', () => {
    const { element } = open([sabrina, nicki]);

    expect(element.textContent).toContain('admin.deleteModal.multiple');
    expect(Array.from(element.querySelectorAll('li')).map(li => li.textContent)).toEqual([
      'Sabrina Carpenter — Espresso', 'Nicki Minaj — Starships',
    ]);
  });

  it('supprime puis ferme la fenêtre', async () => {
    const { fixture, confirm } = open([sabrina, nicki]);

    confirm.click();
    await settle(fixture);

    expect(api.deleteTrack.mock.calls.map(([id]) => id)).toEqual([2, 3]);
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('reste ouverte et dit pourquoi quand l\'API refuse', async () => {
    const { fixture, element, confirm } = open([sabrina], {
      deleteTrack: vi.fn(async () => Promise.reject(problem(409, 'catalogue.track_in_use'))),
    });

    confirm.click();
    await settle(fixture);

    expect(dialog.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.catalogue.track_in_use');
    expect(confirm.disabled).toBe(false);
  });

  it('annule sans rien supprimer', () => {
    const { cancel } = open([sabrina]);

    cancel.click();

    expect(dialog.close).toHaveBeenCalledWith(false);
    expect(api.deleteTrack).not.toHaveBeenCalled();
  });
});
