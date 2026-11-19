import { TestBed } from '@angular/core/testing';
import { GroupsStore } from './groups.store';
import { DAILY, FakeSocialApi, GROUP, OTHER_GROUP, provideFakeSocialApi } from './testing/fake-social-api';

describe('GroupsStore', () => {
  let api: FakeSocialApi;
  let store: InstanceType<typeof GroupsStore>;

  beforeEach(() => {
    api = new FakeSocialApi();
    TestBed.configureTestingModule({ providers: [GroupsStore, provideFakeSocialApi(api)] });
    store = TestBed.inject(GroupsStore);
  });

  it('lit mes groupes et le classement du Défi du premier, sans demander la Survie', async () => {
    await store.load();

    expect(store.status()).toBe('ready');
    expect(store.groups()).toEqual([GROUP, OTHER_GROUP]);
    expect(store.selected()).toEqual(GROUP);
    expect(store.scores()?.daily).toEqual(DAILY);
    expect(store.ranking()).toBeNull();
    expect(store.canCreate()).toBe(true);
    expect(api.calls).toEqual(['myGroups', 'scores:4']);
  });

  it('avec la Survie, lit aussi son classement, une fois par groupe', async () => {
    await store.load(null, true);
    expect(store.ranking()?.entries).toHaveLength(3);

    await store.select(4, true);
    await store.select(4);
    expect(api.calls).toEqual(['myGroups', 'scores:4', 'ranking:4']);
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
    expect(store.scores()).toBeNull();
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

    expect(store.selectedId()).toBe(7);
    expect(store.scores()?.name).toBe('Famille');
  });

  it('un classement illisible passe en erreur, la liste reste ; le regarder à nouveau le relit', async () => {
    api.scoresByGroup.delete(4);
    api.rankings.delete(4);

    await store.load(null, true);

    expect(store.status()).toBe('ready');
    expect(store.scoresStatus()).toBe('error');
    expect(store.rankingStatus()).toBe('error');

    api.scoresByGroup.set(4, { groupId: 4, name: 'Potes', daily: DAILY });
    await store.select(4);
    expect(store.scoresStatus()).toBe('ready');
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
    expect(store.scores()?.groupId).toBe(7);
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
