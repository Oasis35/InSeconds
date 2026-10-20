import { Provider } from '@angular/core';
import { DeezerResult, PoolTrack } from '../../domain/pool-track';
import { CatalogueApi } from '../catalogue.api';

/** Erreur telle que la lève le client NSwag quand l'API répond par un `ProblemDetails` (cf. `toAppError`). */
export function problem(status: number, code: string, traceId = '0123456789abcdef0123456789abcdef') {
  return { status, code, traceId };
}

/** Un morceau du pool pour les tests (cf. `PoolTrackFixture`). */
export { poolTrack } from '../../domain/testing/pool-track.fixture';

export function deezerResult(overrides: Partial<DeezerResult> = {}): DeezerResult {
  return { deezerTrackId: 42, artist: 'E2E Artist', title: 'E2E Track', previewUrl: 'https://preview/42.mp3', ...overrides };
}

function defaults() {
  return {
    listTracks: vi.fn<() => Promise<PoolTrack[]>>(() => Promise.resolve([])),
    addTrack: vi.fn<(deezerTrackId: number) => Promise<void>>(() => Promise.resolve()),
    renameTrack: vi.fn<(id: number, artist: string, title: string) => Promise<void>>(() => Promise.resolve()),
    setTrackDisabled: vi.fn<(id: number, isDisabled: boolean) => Promise<void>>(() => Promise.resolve()),
    deleteTrack: vi.fn<(id: number) => Promise<void>>(() => Promise.resolve()),
    searchDeezer: vi.fn<(query: string) => Promise<DeezerResult[]>>(() => Promise.resolve([])),
    findPreviewUrl: vi.fn<(track: Pick<PoolTrack, 'artist' | 'title' | 'deezerTrackId'>) => Promise<string | null>>(
      () => Promise.resolve(null),
    ),
  } satisfies Record<keyof CatalogueApi, unknown>;
}

export type FakeCatalogueApi = ReturnType<typeof defaults>;

/** Faux `CatalogueApi` : chaque méthode est un espion qui réussit par défaut ; les tests remplacent ce qui les intéresse. */
export function fakeCatalogueApi(overrides: Partial<FakeCatalogueApi> = {}): FakeCatalogueApi {
  return { ...defaults(), ...overrides };
}

export function provideCatalogueApiFake(api: FakeCatalogueApi): Provider {
  return { provide: CatalogueApi, useValue: api };
}
