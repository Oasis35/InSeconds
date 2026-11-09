import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideTranslateService } from '@ngx-translate/core';
import { PoolStore } from '../../../data-access/pool.store';
import { FakeCatalogueApi, fakeCatalogueApi, poolTrack, problem, provideCatalogueApiFake } from '../../../data-access/testing/fake-catalogue-api';
import { PoolTrack } from '../../../domain/pool-track';
import { EditTrackDialog } from './edit-track.dialog';
import { fakeCooldownApi, provideCooldownApiFake } from '../../../data-access/testing/fake-cooldown-api';

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('EditTrackDialog', () => {
  const track = poolTrack({ id: 7, artist: 'Eminem', title: 'Lose Yourself' });
  let api: FakeCatalogueApi;
  let dialog: { close: ReturnType<typeof vi.fn> };

  function open(data: PoolTrack = track, overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi(overrides);
    dialog = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), PoolStore, provideCatalogueApiFake(api), provideCooldownApiFake(fakeCooldownApi()),
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialog },
      ],
    });
    const fixture = TestBed.createComponent(EditTrackDialog);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      artist: element.querySelector<HTMLInputElement>('#edit-track-artist')!,
      title: element.querySelector<HTMLInputElement>('#edit-track-title')!,
      save: element.querySelector<HTMLButtonElement>('button[type="submit"]')!,
    };
  }

  const settle = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
    await fixture.whenStable();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  it('préremplit les deux champs, avec « Enregistrer » désactivé tant que rien ne change', () => {
    const { artist, title, save } = open();

    expect(artist.value).toBe('Eminem');
    expect(title.value).toBe('Lose Yourself');
    expect(save.disabled).toBe(true);
  });

  it('prévient quand le morceau est dans le défi du jour, sans l\'interdire', () => {
    const { element } = open(poolTrack({ id: 8, artist: 'Eminem', inTodayChallenge: true }));

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('admin.editModal.todayWarning');
  });

  it('n\'avertit pas pour un autre morceau', () => {
    const { element } = open();

    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('refuse un nom vide', async () => {
    const { fixture, title, save } = open();

    type(title, '   ');
    await settle(fixture);

    expect(save.disabled).toBe(true);
  });

  it('enregistre sans les espaces autour puis ferme la fenêtre', async () => {
    const { fixture, title, save } = open();

    type(title, '  Titre corrigé ');
    await settle(fixture);
    expect(save.disabled).toBe(false);
    save.click();
    await settle(fixture);

    expect(api.renameTrack).toHaveBeenCalledWith(7, 'Eminem', 'Titre corrigé', undefined);
    expect(dialog.close).toHaveBeenCalledWith(true);
  });

  it('préremplit le genre de Deezer, avertit que Deezer l\'emporte, et n\'envoie le genre que s\'il change', async () => {
    const { fixture, element, artist, save } = open(poolTrack({ id: 9, artist: 'Eminem', genres: ['Rap/Hip Hop'] }));
    const genre = element.querySelector<HTMLInputElement>('#edit-track-genre')!;

    expect(genre.value).toBe('Rap/Hip Hop');
    expect(element.querySelector('[data-testid="edit-track-genre-hint"]')?.textContent).toContain('admin.editModal.genreHint');

    // Artiste seul : le genre de Deezer n'est pas renvoyé.
    type(artist, 'Eminem Jr');
    await settle(fixture);
    save.click();
    await settle(fixture);
    expect(api.renameTrack).toHaveBeenLastCalledWith(9, 'Eminem Jr', 'Titre', undefined);
  });

  it('des genres de Deezer plus longs que la limite n\'empêchent pas de corriger le titre', async () => {
    const long = ['Pop', 'Dance', 'Electro', 'Rock & Folk', 'Musique de film', 'Hip Hop', 'Soul & Funk'];
    const { fixture, title, save } = open(poolTrack({ id: 9, artist: 'Eminem', title: 'Titre', genres: long }));

    type(title, 'Titre corrigé');
    await settle(fixture);

    expect(save.disabled).toBe(false);
  });

  it('envoie le genre saisi, ou vide pour le retirer', async () => {
    const { fixture, element, save } = open(poolTrack({ id: 9, artist: 'Eminem', title: 'Titre' }));
    const genre = element.querySelector<HTMLInputElement>('#edit-track-genre')!;

    type(genre, ' Blues ');
    await settle(fixture);
    expect(save.disabled).toBe(false);
    save.click();
    await settle(fixture);

    expect(api.renameTrack).toHaveBeenCalledWith(9, 'Eminem', 'Titre', 'Blues');
  });

  it('reste ouverte et dit pourquoi quand l\'API refuse', async () => {
    const { fixture, element, title, save } = open(track, {
      renameTrack: vi.fn(async () => Promise.reject(problem(404, 'common.not_found'))),
    });

    type(title, 'Autre');
    await settle(fixture);
    save.click();
    await settle(fixture);

    expect(dialog.close).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.common.not_found');
    expect(save.disabled).toBe(false);
  });

  it('annule sans rien enregistrer', () => {
    const { element } = open();

    element.querySelector<HTMLButtonElement>('button[type="button"]:not([aria-label])')!.click();

    expect(dialog.close).toHaveBeenCalledWith(false);
    expect(api.renameTrack).not.toHaveBeenCalled();
  });
});
