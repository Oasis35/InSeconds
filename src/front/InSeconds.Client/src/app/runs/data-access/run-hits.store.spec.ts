import { TestBed } from '@angular/core/testing';
import { StoragePort } from '../../core/storage/storage.port';
import { FakeSocialApi, provideFakeSocialApi } from '../../social/data-access/testing/fake-social-api';
import { RunHit } from '../domain/run-hits';
import { RunHitsStore } from './run-hits.store';
import { FakeRunsApi, provideFakeRunsApi } from './testing/fake-runs-api';

const HITS: RunHit[] = [
  { key: 'first_setlist', earned: true, progress: null, target: null },
  { key: 'first_risky_round', earned: false, progress: null, target: null },
  { key: 'ten_setlists', earned: false, progress: 7, target: 10 },
];

describe('RunHitsStore', () => {
  let api: FakeRunsApi;
  let social: FakeSocialApi;
  let saved: Map<string, string>;

  function create() {
    const storage: StoragePort = { get: key => saved.get(key) ?? null, set: (key, value) => void saved.set(key, value), remove: key => void saved.delete(key) };
    TestBed.configureTestingModule({ providers: [RunHitsStore, provideFakeRunsApi(api), provideFakeSocialApi(social), { provide: StoragePort, useValue: storage }] });
    return TestBed.inject(RunHitsStore);
  }

  beforeEach(() => {
    api = new FakeRunsApi();
    api.hitsResult = HITS;
    social = new FakeSocialApi();
    saved = new Map();
  });

  it('ajoute le Hit des groupes à ceux du mode et compte les obtenus', async () => {
    const store = create();
    await store.load(false);

    expect(store.hits().map(hit => hit.key)).toEqual(['first_setlist', 'first_risky_round', 'first_group', 'ten_setlists']);
    expect([store.earnedCount(), store.total()]).toEqual([2, 4]);
  });

  it('ne fête rien à la première lecture sur ce navigateur, et retient ce qui est obtenu', async () => {
    const store = create();
    await store.load(false);

    expect(store.fresh()).toEqual([]);
    expect(JSON.parse(saved.get('inseconds.hits.seen')!)).toEqual(['first_setlist', 'first_group']);
  });

  it('signale un nouveau Hit sans le noter tant que l\'écran des Hits ne l\'a pas montré', async () => {
    saved.set('inseconds.hits.seen', JSON.stringify(['first_setlist']));
    const store = create();

    await store.load(false);
    expect(store.fresh()).toEqual(['first_group']);
    expect(JSON.parse(saved.get('inseconds.hits.seen')!)).toEqual(['first_setlist']);

    await store.load(true);
    expect(store.fresh()).toEqual(['first_group']);
    expect(JSON.parse(saved.get('inseconds.hits.seen')!)).toEqual(['first_setlist', 'first_group']);
  });

  it('laisse le Hit des groupes à obtenir quand les groupes ne répondent pas', async () => {
    social.failGroups = true;
    const store = create();
    await store.load(false);

    expect(store.status()).toBe('ready');
    expect(store.hits().find(hit => hit.key === 'first_group')?.earned).toBe(false);
  });

  it('n\'a rien à montrer à un navigateur inconnu, et dit quand les Hits ne répondent pas', async () => {
    api.hitsResult = [];
    const store = create();
    await store.load(true);
    expect([store.status(), store.total()]).toEqual(['ready', 0]);
    expect(saved.has('inseconds.hits.seen')).toBe(false);

    api.hitsResult = new Error('down');
    await store.load(true);
    expect(store.status()).toBe('error');
  });

  it('repart de zéro quand la liste gardée est illisible', async () => {
    saved.set('inseconds.hits.seen', '{oops');
    const store = create();
    await store.load(false);

    expect(store.fresh()).toEqual([]);
  });
});
