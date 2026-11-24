import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogueClient } from '../../api/catalogue/api.generated';
import { CatalogueApi } from './catalogue.api';

describe('CatalogueApi : extrait et versions d\'un morceau', () => {
  const sought = { artist: 'Queen', title: 'Under Pressure', deezerTrackId: 3098519 };
  const results = [
    { deezerTrackId: 4091932171, artist: 'Queen', title: 'Under Pressure (feat. David Bowie)', previewUrl: 'https://preview/a.mp3' },
    { deezerTrackId: 4092342311, artist: 'Queen', title: 'Under Pressure (Live)', previewUrl: undefined },
    { deezerTrackId: 3098519, artist: 'Queen', title: 'Under Pressure', previewUrl: 'https://preview/own.mp3' },
  ];
  const client = {
    searchDeezer: vi.fn(() => of(results)),
    updateTrack: vi.fn(() => of({})),
  };
  let api: CatalogueApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CatalogueApi, { provide: CatalogueClient, useValue: client }] });
    api = TestBed.inject(CatalogueApi);
  });

  it('écoute l\'extrait du résultat qui a le même identifiant Deezer', async () => {
    expect(await api.findPreviewUrl(sought)).toBe('https://preview/own.mp3');
    expect(client.searchDeezer).toHaveBeenCalledWith('Queen Under Pressure');
  });

  it('ne se rabat jamais sur un autre résultat : sans son identifiant dans la recherche, pas d\'extrait', async () => {
    expect(await api.findPreviewUrl({ ...sought, deezerTrackId: 999 })).toBeNull();
  });

  it('ne rend pas d\'extrait quand le résultat de même identifiant n\'en a pas', async () => {
    expect(await api.findPreviewUrl({ ...sought, deezerTrackId: 4092342311 })).toBeNull();
  });

  it('propose les autres versions qui ont un extrait, sans le morceau lui-même', async () => {
    const found = await api.findReplacements(sought);

    expect(found.map(r => r.deezerTrackId)).toEqual([4091932171]);
  });

  it('remplace la source du morceau par l\'identifiant choisi', async () => {
    await api.replaceSource(645, 4091932171);

    expect(client.updateTrack).toHaveBeenCalledWith(645, { deezerTrackId: 4091932171 });
  });
});
