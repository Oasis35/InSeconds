import { TestBed } from '@angular/core/testing';
import { GroupsStore } from './groups.store';
import { FakeSocialApi, GROUP, OTHER_GROUP, provideFakeSocialApi } from './testing/fake-social-api';

describe('GroupsStore', () => {
  let api: FakeSocialApi;
  let store: InstanceType<typeof GroupsStore>;

  beforeEach(() => {
    api = new FakeSocialApi();
    TestBed.configureTestingModule({ providers: [GroupsStore, provideFakeSocialApi(api)] });
    store = TestBed.inject(GroupsStore);
  });

  it('lit mes groupes et le classement du premier', async () => {
    await store.load();

    expect(store.status()).toBe('ready');
    expect(store.groups()).toEqual([GROUP, OTHER_GROUP]);
    expect(store.selected()).toEqual(GROUP);
    expect(store.ranking()?.entries).toHaveLength(3);
    expect(store.canCreate()).toBe(true);
  });

  it('ouvre le groupe demandé, ou le premier si ce n\'est pas un des miens', async () => {
    await store.load(7);
    expect(store.selectedId()).toBe(7);

    await store.load(99);
    expect(store.selectedId()).toBe(4);
  });

  it('sans groupe, rien à classer', async () => {
    api.groups = { groups: [], maxGroups: 5 };

    await store.load();

    expect(store.selected()).toBeNull();
    expect(store.ranking()).toBeNull();
    expect(api.calls).toEqual(['myGroups']);
  });

  it('à la limite de groupes, on ne peut plus en créer', async () => {
    api.groups = { groups: [GROUP, OTHER_GROUP], maxGroups: 2 };

    await store.load();

    expect(store.canCreate()).toBe(false);
  });

  it('change de groupe', async () => {
    await store.load();

    await store.select(7);

    expect(store.ranking()?.name).toBe('Famille');
  });

  it('un classement illisible passe en erreur, la liste reste', async () => {
    api.rankings.delete(4);

    await store.load();

    expect(store.status()).toBe('ready');
    expect(store.rankingStatus()).toBe('error');
  });

  it('une panne de la liste passe en erreur', async () => {
    api.failGroups = true;

    await store.load();

    expect(store.status()).toBe('error');
  });

  it('quitter un groupe relit la liste', async () => {
    await store.load();

    expect(await store.leave(4)).toBe(true);

    expect(store.groups()).toEqual([OTHER_GROUP]);
    expect(store.selectedId()).toBe(7);
  });

  it('un refus de quitter ne change rien', async () => {
    await store.load();
    api.failLeave = true;

    expect(await store.leave(4)).toBe(false);
    expect(store.groups()).toHaveLength(2);
  });

  it('lit ma place dans chacun de mes groupes', async () => {
    await store.loadStandings();

    expect(store.standings()).toEqual([
      { groupId: 4, name: 'Potes', rank: 2, members: 3 },
      { groupId: 7, name: 'Famille', rank: 1, members: 1 },
    ]);
  });

  it('un classement illisible est sauté, une panne laisse la liste vide', async () => {
    api.rankings.delete(7);
    await store.loadStandings();
    expect(store.standings()).toHaveLength(1);

    api.failGroups = true;
    await store.loadStandings();
    expect(store.standings()).toEqual([]);
  });
});
