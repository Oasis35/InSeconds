import { TestBed } from '@angular/core/testing';
import { AdminGroupsStore } from './groups.store';
import { FakeAdminGroupsApi, adminGroup, adminGroupMember, fakeAdminGroupsApi, provideAdminGroupsApiFake } from './testing/fake-admin-groups-api';
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

  it('déplie un groupe et lit ses membres, puis le replie', async () => {
    const alice = adminGroupMember({ pseudo: 'Alice', isOwner: true });
    const store = create({ members: vi.fn(async () => [alice]) });
    await store.load();
    expect(store.expandedMembers()).toBeNull();

    await store.toggle(1);
    expect(api.members).toHaveBeenCalledWith(1);
    expect(store.expandedId()).toBe(1);
    expect(store.expandedMembers()).toEqual({ members: [alice], status: 'idle' });

    await store.toggle(1);
    expect(store.expandedId()).toBeNull();
    expect(store.expandedMembers()).toBeNull();
  });

  it('un seul groupe est déplié à la fois, et ses membres sont relus à chaque dépliage', async () => {
    const store = create();
    await store.load();
    await store.toggle(1);
    await store.toggle(2);
    expect(store.expandedId()).toBe(2);
    await store.toggle(1);
    expect(api.members).toHaveBeenCalledTimes(3);
  });

  it('garde l\'erreur de lecture des membres, sans toucher la liste', async () => {
    const store = create({ members: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });
    await store.load();
    await store.toggle(1);
    expect(store.expandedMembers()).toEqual({ members: null, status: 'error' });
    expect(store.groups()).toHaveLength(2);
  });

  it('ignore la réponse des membres d\'un groupe replié entre-temps', async () => {
    type Members = ReturnType<typeof adminGroupMember>[];
    let release: (members: Members) => void = () => undefined;
    const store = create({ members: vi.fn(() => new Promise<Members>(resolve => { release = resolve; })) });
    await store.load();
    const pending = store.toggle(1);
    await store.toggle(1);
    release([adminGroupMember()]);
    await pending;
    expect(store.expandedId()).toBeNull();
    expect(store.members()).toEqual({});
  });

  it('supprimer le groupe déplié le replie', async () => {
    const store = create();
    await store.load();
    await store.toggle(1);
    await store.removeGroup(1);
    expect(store.expandedId()).toBeNull();
  });

  it('confie le groupe à un membre puis relit la liste et les membres, sans repasser par le chargement', async () => {
    const afterTransfer = [adminGroupMember({ pseudo: 'Alice' }), adminGroupMember({ pseudo: 'Bob', isOwner: true })];
    const store = create({ members: vi.fn().mockResolvedValueOnce([adminGroupMember({ pseudo: 'Alice', isOwner: true })]).mockResolvedValue(afterTransfer) });
    await store.load();
    await store.toggle(1);

    expect(await store.transferOwner(1, 'Bob')).toBe(true);

    expect(api.transferOwner).toHaveBeenCalledWith(1, 'Bob');
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(store.expandedMembers()?.members).toEqual(afterTransfer);
    expect(store.isFulfilled()).toBe(true);
  });

  it('un changement de créateur refusé garde l\'erreur et la liste', async () => {
    const store = create({ transferOwner: vi.fn(() => Promise.reject(problem(400, 'social.invalid_successor'))) });
    await store.load();
    await store.toggle(1);

    expect(await store.transferOwner(1, 'Inconnu')).toBe(false);

    expect(store.actionError()).toMatchObject({ groupId: 1, error: { code: 'social.invalid_successor' } });
    expect(store.expandedId()).toBe(1);
  });

  it('retire un membre avec le successeur, puis relit', async () => {
    const store = create();
    await store.load();
    await store.toggle(1);

    expect(await store.removeMember(1, 'Alice', 'Bob')).toBe(true);

    expect(api.removeMember).toHaveBeenCalledWith(1, 'Alice', 'Bob');
    expect(api.members).toHaveBeenCalledTimes(2);
  });

  it('retirer le dernier membre : le groupe disparaît de la liste et se replie', async () => {
    const store = create({ list: vi.fn().mockResolvedValueOnce([copains, voisins]).mockResolvedValue([voisins]) });
    await store.load();
    await store.toggle(1);

    expect(await store.removeMember(1, 'Alice', null)).toBe(true);

    expect(store.groups()).toEqual([voisins]);
    expect(store.expandedId()).toBeNull();
  });

  it('un retrait refusé (créateur sans successeur) garde l\'erreur', async () => {
    const store = create({ removeMember: vi.fn(() => Promise.reject(problem(409, 'social.owner_must_hand_over'))) });
    await store.load();
    await store.toggle(1);

    expect(await store.removeMember(1, 'Alice', null)).toBe(false);

    expect(store.actionError()).toMatchObject({ groupId: 1, error: { code: 'social.owner_must_hand_over' } });
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
