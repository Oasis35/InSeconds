import { TestBed } from '@angular/core/testing';
import { Candidate } from '../domain/candidates';
import { AdminCounts } from './admin-counts';
import { CANDIDATES_MAX_IDLE_POLLS, CANDIDATES_POLL_MS, CandidatesStore } from './candidates.store';
import { FakeCatalogueApi, candidate, fakeCatalogueApi, problem, provideCatalogueApiFake } from './testing/fake-catalogue-api';

describe('CandidatesStore', () => {
  const a = candidate({ id: 1, priority: 'A', rank: 900 });
  const b = candidate({ id: 2, priority: 'B' });
  const missing = candidate({ id: 3, preview: 'missing' });
  const dismissed = candidate({ id: 4, isDismissed: true });

  let api: FakeCatalogueApi;
  let store: InstanceType<typeof CandidatesStore>;

  async function setup(list: Candidate[] = [a, b, missing, dismissed], overrides: Partial<FakeCatalogueApi> = {}) {
    api = fakeCatalogueApi({ listCandidates: vi.fn(async () => list), ...overrides });
    TestBed.configureTestingModule({ providers: [CandidatesStore, provideCatalogueApiFake(api)] });
    store = TestBed.inject(CandidatesStore);
    await store.load();
  }

  afterEach(() => vi.useRealTimers());

  it('lit la liste, montre les candidats à traiter par priorité et compte ceux de l\'onglet', async () => {
    await setup();

    expect(store.shown().map(c => c.id)).toEqual([1, 2, 3]);
    expect(store.todoCount()).toBe(3);
    expect(store.dismissedCount()).toBe(1);
    expect(TestBed.inject(AdminCounts).candidates()).toBe(3);
  });

  it('montre les écartés dans leur vue et filtre par priorité', async () => {
    await setup();

    store.setView('dismissed');
    expect(store.shown().map(c => c.id)).toEqual([4]);
    store.setView('todo');
    store.setPriority('none');
    expect(store.shown().map(c => c.id)).toEqual([3]);
  });

  it('ne laisse ajouter que les candidats cochés qui le peuvent', async () => {
    await setup();

    store.toggleSelection(1);
    store.toggleSelection(3);
    expect(store.addableSelectedIds()).toEqual([1]);
    store.toggleSelection(3);
    expect(store.selectedIds()).toEqual([1]);
  });

  it('coche tout ce qui est ajoutable dans la vue, puis décoche', async () => {
    await setup();

    store.toggleAllShown();
    expect(store.selectedIds()).toEqual([1, 2]);
    store.toggleAllShown();
    expect(store.selectedIds()).toEqual([]);
  });

  it('importe, relit et garde le résultat à afficher', async () => {
    await setup();
    const parsed = { items: [{ deezerTrackId: 7, priority: 'A' as const }], issues: [] };

    const error = await store.importItems(parsed);

    expect(error).toBeNull();
    expect(api.importCandidates).toHaveBeenCalledWith(parsed.items);
    expect(store.lastImport()).toEqual({ created: 1, alreadyCandidates: 0, alreadyInCatalogue: 0 });
    expect(api.listCandidates).toHaveBeenCalledTimes(2);
  });

  it('ajoute la sélection au pool : seulement les ajoutables, puis vide la sélection', async () => {
    await setup();
    store.toggleSelection(1);
    store.toggleSelection(3);

    await store.addSelected();

    expect(api.addCandidates).toHaveBeenCalledWith([1]);
    expect(store.lastAdd()).toEqual({ queued: 1, skipped: 0 });
    expect(store.selectedIds()).toEqual([]);
  });

  it('écarte la sélection, puis la remet', async () => {
    await setup();
    store.toggleSelection(2);
    await store.dismissSelected();
    expect(api.dismissCandidates).toHaveBeenCalledWith([2], true);

    store.setView('dismissed');
    store.toggleSelection(4);
    await store.restoreSelected();
    expect(api.dismissCandidates).toHaveBeenLastCalledWith([4], false);
  });

  it('rend l\'erreur d\'une action et relit quand même la liste', async () => {
    await setup([a], { addCandidates: vi.fn(() => Promise.reject(problem(422, 'catalogue.candidate_preview_missing'))) });
    store.toggleSelection(1);

    const error = await store.addSelected();

    expect(error?.code).toBe('catalogue.candidate_preview_missing');
    expect(api.listCandidates).toHaveBeenCalledTimes(2);
    expect(store.busy()).toBe(false);
  });

  it('relit la liste tant que des candidats attendent leur lecture, puis s\'arrête', async () => {
    vi.useFakeTimers();
    const lists = [[candidate({ id: 1, status: 'pending', preview: 'unknown' })], [candidate({ id: 1 })]];
    await setup([], { listCandidates: vi.fn(async () => lists.shift() ?? [candidate({ id: 1 })]) });
    expect(store.pendingCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(CANDIDATES_POLL_MS);
    expect(store.pendingCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(CANDIDATES_POLL_MS * 3);
    expect(api.listCandidates).toHaveBeenCalledTimes(2);
  });

  it('arrête le sondage quand rien n\'avance (Deezer ne répond pas)', async () => {
    vi.useFakeTimers();
    await setup([], { listCandidates: vi.fn(async () => [candidate({ id: 1, status: 'pending', preview: 'unknown' })]) });

    await vi.advanceTimersByTimeAsync(CANDIDATES_POLL_MS * (CANDIDATES_MAX_IDLE_POLLS + 5));

    expect(api.listCandidates).toHaveBeenCalledTimes(CANDIDATES_MAX_IDLE_POLLS + 1);
  });

  it('ne sonde pas pour un candidat écarté encore à lire', async () => {
    await setup([candidate({ id: 1, status: 'pending', preview: 'unknown', isDismissed: true })]);

    expect(store.pendingCount()).toBe(0);
  });

  it('retient l\'erreur de lecture de la liste', async () => {
    await setup([], { listCandidates: vi.fn(() => Promise.reject(problem(500, 'common.server_error'))) });

    expect(store.error()?.code).toBe('common.server_error');
  });

  it('demande une adresse d\'extrait neuve', async () => {
    await setup();

    expect(await store.previewUrl(1)).toBe('https://preview/candidate.mp3');
    expect(api.candidatePreviewUrl).toHaveBeenCalledWith(1);
  });
});
