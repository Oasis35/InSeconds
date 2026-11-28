import { TestBed } from '@angular/core/testing';
import { HomePlaceReader } from './home-place';
import { FakeSocialApi, GENERAL, GROUP, OTHER_GROUP, RANKING, provideFakeSocialApi } from './testing/fake-social-api';

describe('HomePlaceReader', () => {
  let api: FakeSocialApi;
  let reader: HomePlaceReader;

  beforeEach(() => {
    api = new FakeSocialApi();
    TestBed.configureTestingModule({ providers: [HomePlaceReader, provideFakeSocialApi(api)] });
    reader = TestBed.inject(HomePlaceReader);
  });

  it('sa meilleure place parmi ses groupes, et sa place au général', async () => {
    // « Potes » : 2e ; « Famille » : 1er (cf. le faux) : la meilleure place est celle de « Famille ».
    const place = await reader.load();

    expect(place.group).toEqual({ name: 'Famille', rank: 1 });
    expect(place.general).toBe(42);
    expect(api.calls).toEqual(expect.arrayContaining(['myGroups', 'ranking:4', 'ranking:7', 'generalRanking']));
  });

  it('un groupe où il n\'a fini aucune partie ne compte pas dans sa meilleure place', async () => {
    api.rankings.set(7, { groupId: 7, name: 'Famille', entries: [{ rank: null, pseudo: 'Moi', isMe: true, points: null, badge: null }] });

    expect((await reader.load()).group).toEqual({ name: 'Potes', rank: 2 });
  });

  it('sans groupe : aucune place de groupe, mais le général reste lu', async () => {
    api.groups = { groups: [], maxGroups: 5 };

    const place = await reader.load();

    expect(place.group).toBeNull();
    expect(place.general).toBe(42);
  });

  it('un classement de groupe illisible est laissé de côté, les autres comptent', async () => {
    api.rankings.delete(7);

    expect((await reader.load()).group).toEqual({ name: GROUP.name, rank: 2 });
  });

  it('la liste des groupes en échec laisse la place de groupe vide, jamais une erreur', async () => {
    api.failGroups = true;

    const place = await reader.load();

    expect(place.group).toBeNull();
    expect(place.general).toBe(42);
  });

  it('le général illisible laisse la place générale vide, les groupes comptent quand même', async () => {
    api.failGeneral = true;

    const place = await reader.load();

    expect(place.general).toBeNull();
    expect(place.group).toEqual({ name: 'Famille', rank: 1 });
  });

  it('tout en échec : une place vide, sans lever d\'erreur', async () => {
    api.failGroups = true;
    api.failGeneral = true;

    expect(await reader.load()).toEqual({ group: null, general: null });
  });

  it('un joueur absent du général (il n\'y apparaît pas par choix) : pas de place générale', async () => {
    api.general = { ...GENERAL, top: GENERAL.top, around: [] };

    expect((await reader.load()).general).toBeNull();
  });

  it('en cas d\'égalité de rang, le premier groupe de la liste l\'emporte', async () => {
    api.rankings.set(4, { ...RANKING, entries: [{ rank: 1, pseudo: 'Moi', isMe: true, points: 100, badge: null }] });

    expect((await reader.load()).group).toEqual({ name: 'Potes', rank: 1 });
    expect([GROUP, OTHER_GROUP].map(group => group.id)).toEqual([4, 7]);
  });
});
