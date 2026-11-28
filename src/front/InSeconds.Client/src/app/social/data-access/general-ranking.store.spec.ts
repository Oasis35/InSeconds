import { TestBed } from '@angular/core/testing';
import { GeneralRankingStore } from './general-ranking.store';
import { FakeSocialApi, GENERAL, provideFakeSocialApi } from './testing/fake-social-api';

describe('GeneralRankingStore', () => {
  let api: FakeSocialApi;
  let store: InstanceType<typeof GeneralRankingStore>;

  beforeEach(() => {
    api = new FakeSocialApi();
    TestBed.configureTestingModule({ providers: [GeneralRankingStore, provideFakeSocialApi(api)] });
    store = TestBed.inject(GeneralRankingStore);
  });

  it('rien n\'est lu avant le chargement', () => {
    expect(store.status()).toBe('idle');
    expect(store.ranking()).toBeNull();
    expect(api.calls).toEqual([]);
  });

  describe('load', () => {
    it('lit le classement général et passe à « prêt »', async () => {
      await store.load();

      expect(store.status()).toBe('ready');
      expect(store.ranking()).toEqual(GENERAL);
      expect(api.calls).toEqual(['generalRanking']);
    });

    it('est « en chargement » pendant la lecture', async () => {
      const loading = store.load();

      expect(store.status()).toBe('loading');
      await loading;
    });

    it('une lecture en échec laisse un état d\'erreur sans classement', async () => {
      api.failGeneral = true;

      await store.load();

      expect(store.status()).toBe('error');
      expect(store.ranking()).toBeNull();
    });

    it('se relit : un nouvel essai après une erreur rend le classement', async () => {
      api.failGeneral = true;
      await store.load();
      api.failGeneral = false;

      await store.load();

      expect(store.status()).toBe('ready');
      expect(store.ranking()).toEqual(GENERAL);
    });
  });

  describe('changer de nom', () => {
    beforeEach(async () => {
      await store.load();
      api.calls.length = 0;
    });

    it('passer à un alias change l\'identité, puis relit le classement (la ligne y change de nom)', async () => {
      await store.setMode('alias');

      expect(api.calls).toEqual(['identity:alias', 'generalRanking']);
      expect(store.ranking()?.identity?.mode).toBe('alias');
      expect(store.ranking()?.identity?.alias).toMatch(/^Hibou rêveur/);
      expect(store.saving()).toBe(false);
      expect(store.saveFailed()).toBe(false);
    });

    it('revenir au pseudo change l\'identité et relit le classement', async () => {
      await store.setMode('alias');
      api.calls.length = 0;

      await store.setMode('pseudo');

      expect(api.calls).toEqual(['identity:pseudo', 'generalRanking']);
      expect(store.ranking()?.identity).toEqual({ mode: 'pseudo', name: 'Moi', alias: null });
    });

    it('« Autre alias » tire un nouvel alias, puis relit le classement', async () => {
      await store.drawAlias();
      const first = store.ranking()?.identity?.alias;
      await store.drawAlias();

      expect(api.calls).toEqual(['alias', 'generalRanking', 'alias', 'generalRanking']);
      expect(store.ranking()?.identity?.alias).not.toBe(first);
    });

    it('un changement refusé le dit, sans relire le classement, et le classement déjà lu reste', async () => {
      api.failIdentity = true;

      await store.setMode('alias');

      expect(store.saveFailed()).toBe(true);
      expect(store.saving()).toBe(false);
      expect(api.calls).toEqual(['identity:alias']);
      expect(store.ranking()).toEqual(GENERAL);
    });

    it('un nouvel essai efface le refus d\'avant', async () => {
      api.failIdentity = true;
      await store.setMode('alias');
      api.failIdentity = false;

      await store.setMode('alias');

      expect(store.saveFailed()).toBe(false);
    });

    it('deux demandes à la fois n\'en envoient qu\'une, la seconde est ignorée', async () => {
      const first = store.setMode('alias');
      const second = store.drawAlias();
      expect(store.saving()).toBe(true);

      await Promise.all([first, second]);

      expect(api.calls).toEqual(['identity:alias', 'generalRanking']);
    });
  });
});
