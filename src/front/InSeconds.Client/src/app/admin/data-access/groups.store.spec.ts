import { TestBed } from '@angular/core/testing';
import { AdminGroupsStore } from './groups.store';
import { FakeAdminGroupsApi, adminGroup, fakeAdminGroupsApi, provideAdminGroupsApiFake } from './testing/fake-admin-groups-api';
import { problem } from './testing/fake-catalogue-api';

describe('AdminGroupsStore', () => {
  const copains = adminGroup({ id: 1 });
  const voisins = adminGroup({ id: 2, name: 'Les voisins', ownerPseudo: 'Bob' });

  let api: FakeAdminGroupsApi;

  function create(overrides: Partial<FakeAdminGroupsApi> = {}) {
    api = fakeAdminGroupsApi({ list: vi.fn(async () => [copains, voisins]), ...overrides });
    TestBed.configureTestingModule({ providers: [provideAdminGroupsApiFake(api), AdminGroupsStore] });
    return TestBed.inject(AdminGroupsStore);
  }

  it('charge les groupes', async () => {
    const store = create();
    await store.load();
    expect(store.groups()).toEqual([copains, voisins]);
    expect(store.isFulfilled()).toBe(true);
  });

  it('garde l\'erreur de chargement', async () => {
    const store = create({ list: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });
    await store.load();
    expect(store.error()?.code).toBe('common.unexpected');
  });

  it('filtre par nom ou par créateur', async () => {
    const store = create();
    await store.load();
    store.setFilter('bob');
    expect(store.filteredGroups()).toEqual([voisins]);
  });

  it('renomme avec le nom que rend l\'API', async () => {
    const store = create();
    await store.load();
    expect(await store.renameGroup(1, '  Les amis ')).toBe(true);
    expect(api.rename).toHaveBeenCalledWith(1, '  Les amis ');
    expect(store.groups()[0].name).toBe('Les amis');
    expect(store.pendingIds()).toEqual([]);
  });

  it('un renommage refusé garde l\'ancien nom et le code d\'erreur', async () => {
    const store = create({ rename: vi.fn(() => Promise.reject(problem(400, 'social.invalid_name'))) });
    await store.load();
    expect(await store.renameGroup(1, 'ab')).toBe(false);
    expect(store.groups()[0].name).toBe('Les copains');
    expect(store.actionError()).toMatchObject({ groupId: 1, error: { code: 'social.invalid_name' } });
    store.clearActionError();
    expect(store.actionError()).toBeNull();
  });

  it('remet le nom à zéro avec le nom de remplacement', async () => {
    const store = create();
    await store.load();
    expect(await store.resetGroupName(2)).toBe(true);
    expect(store.groups()[1].name).toBe('Groupe 2');
  });

  it('supprime le groupe de la liste', async () => {
    const store = create();
    await store.load();
    expect(await store.removeGroup(1)).toBe(true);
    expect(store.groups()).toEqual([voisins]);
  });

  it('une suppression refusée garde le groupe', async () => {
    const store = create({ remove: vi.fn(() => Promise.reject(problem(404, 'social.group_not_found'))) });
    await store.load();
    expect(await store.removeGroup(1)).toBe(false);
    expect(store.groups()).toHaveLength(2);
    expect(store.actionError()?.error.code).toBe('social.group_not_found');
  });

  it('ignore une seconde action sur un groupe dont l\'API n\'a pas répondu', async () => {
    let release: () => void = () => undefined;
    const store = create({ remove: vi.fn(() => new Promise<void>(resolve => { release = resolve; })) });
    await store.load();
    const first = store.removeGroup(1);
    expect(store.pendingIds()).toEqual([1]);
    expect(await store.removeGroup(1)).toBe(false);
    release();
    await first;
    expect(api.remove).toHaveBeenCalledTimes(1);
  });
});
