import { TestBed } from '@angular/core/testing';
import { AdminCounts } from './admin-counts';
import { AdminPlayersStore } from './players.store';
import {
  FakeAdminPlayersApi, fakeAdminPlayersApi, playerGame, provideAdminPlayersApiFake, registeredPlayer,
} from './testing/fake-admin-players-api';
import { problem } from './testing/fake-catalogue-api';

describe('AdminPlayersStore', () => {
  const alice = registeredPlayer({ id: 'a' });
  const bob = registeredPlayer({ id: 'b', pseudo: 'Bob', email: 'bob@test.fr' });

  let api: FakeAdminPlayersApi;

  function create(overrides: Partial<FakeAdminPlayersApi> = {}) {
    api = fakeAdminPlayersApi({ list: vi.fn(async () => [alice, bob]), ...overrides });
    TestBed.configureTestingModule({ providers: [provideAdminPlayersApiFake(api), AdminPlayersStore] });
    return TestBed.inject(AdminPlayersStore);
  }

  it('charge les comptes et renseigne l\'effectif de l\'onglet', async () => {
    const store = create();
    await store.load();
    expect(store.players()).toEqual([alice, bob]);
    expect(store.isFulfilled()).toBe(true);
    expect(TestBed.inject(AdminCounts).players()).toBe(2);
  });

  it('garde l\'erreur de chargement', async () => {
    const store = create({ list: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });
    await store.load();
    expect(store.error()?.code).toBe('common.unexpected');
    expect(TestBed.inject(AdminCounts).players()).toBeNull();
  });

  it('filtre par pseudo ou email', async () => {
    const store = create();
    await store.load();
    store.setFilter('test.fr');
    expect(store.filteredPlayers()).toEqual([bob]);
  });

  it('déplie une ligne et lit son historique', async () => {
    const games = [playerGame()];
    const store = create({ history: vi.fn(async () => games) });
    await store.load();
    const pending = store.toggle('a');
    expect(store.expandedHistory()).toEqual({ games: null, status: 'loading' });
    await pending;
    expect(store.expandedId()).toBe('a');
    expect(store.expandedHistory()).toEqual({ games, status: 'idle' });
  });

  it('replie la ligne au second clic, et relit l\'historique à chaque dépliage', async () => {
    const store = create({ history: vi.fn(async () => [playerGame()]) });
    await store.load();
    await store.toggle('a');
    await store.toggle('a');
    expect(store.expandedId()).toBeNull();
    expect(store.expandedHistory()).toBeNull();
    await store.toggle('a');
    expect(api.history).toHaveBeenCalledTimes(2);
  });

  it('une seule ligne dépliée à la fois', async () => {
    const store = create();
    await store.load();
    await store.toggle('a');
    await store.toggle('b');
    expect(store.expandedId()).toBe('b');
    expect(api.history).toHaveBeenLastCalledWith('b');
  });

  it('garde l\'historique déjà lu si le rechargement échoue', async () => {
    const games = [playerGame()];
    const history = vi.fn(async () => games);
    const store = create({ history });
    await store.load();
    await store.toggle('a');
    await store.toggle('a');
    history.mockRejectedValueOnce(problem(500, 'common.unexpected'));
    await store.toggle('a');
    expect(store.expandedHistory()).toEqual({ games, status: 'error' });
  });

  it('signale l\'erreur quand rien n\'a encore été lu', async () => {
    const store = create({ history: vi.fn(() => Promise.reject(problem(404, 'common.not_found'))) });
    await store.load();
    await store.toggle('a');
    expect(store.expandedHistory()).toEqual({ games: null, status: 'error' });
  });

  it('ignore la réponse d\'un historique devenu inutile', async () => {
    let resolveFirst!: (games: ReturnType<typeof playerGame>[]) => void;
    const history = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValue([]);
    const store = create({ history });
    await store.load();
    const first = store.toggle('a');
    await store.toggle('b');
    resolveFirst([playerGame()]);
    await first;
    expect(store.expandedId()).toBe('b');
    expect(store.expandedHistory()).toEqual({ games: [], status: 'idle' });
    expect(store.histories()['a']).toBeUndefined();
  });
});
