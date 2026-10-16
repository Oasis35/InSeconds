import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { ProfileStore } from './profile.store';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, problem, providePlayersApiFake } from './testing/fake-players-api';

describe('ProfileStore', () => {
  let api: FakePlayersApi;
  let store: InstanceType<typeof ProfileStore>;
  let session: InstanceType<typeof SessionStore>;

  function setup(overrides: Parameters<typeof fakePlayersApi>[0] = {}, player: typeof linkedPlayer | null = linkedPlayer) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [ProfileStore, providePlayersApiFake(api)] });
    store = TestBed.inject(ProfileStore);
    session = TestBed.inject(SessionStore);
    if (player) session.signedIn(player);
  }

  describe('pseudo', () => {
    it('enregistre le nouveau pseudo et le répercute dans la session', async () => {
      setup();

      const pending = store.savePseudo('  Bob ');
      expect(store.pseudoStatus()).toBe('pending');
      await pending;

      expect(api.updatePseudo).toHaveBeenCalledWith('Bob');
      expect(store.pseudoStatus()).toBe('done');
      expect(session.player()?.pseudo).toBe('Bob');
    });

    it.each(['', 'ab', 'x'.repeat(21), 'Bob<>'])('n\'envoie pas le pseudo « %s » (refusé par les règles)', async pseudo => {
      setup();

      await store.savePseudo(pseudo);

      expect(api.updatePseudo).not.toHaveBeenCalled();
      expect(store.pseudoStatus()).toBe('idle');
    });

    it('n\'envoie rien quand le pseudo est inchangé', async () => {
      setup();

      await store.savePseudo(' Alice ');

      expect(api.updatePseudo).not.toHaveBeenCalled();
    });

    it('n\'envoie rien pour un invité', async () => {
      setup({}, { ...linkedPlayer, isGuest: true });

      await store.savePseudo('Bob');

      expect(api.updatePseudo).not.toHaveBeenCalled();
    });

    it('garde l\'erreur d\'un pseudo déjà pris et laisse la session intacte', async () => {
      setup({ updatePseudo: vi.fn(async () => Promise.reject(problem(409, 'players.pseudo_taken'))) });

      await store.savePseudo('Bob');

      expect(store.pseudoStatus()).toMatchObject({ error: { code: 'players.pseudo_taken' } });
      expect(session.player()?.pseudo).toBe('Alice');
    });

    it('revient au repos quand le joueur retape', async () => {
      setup();
      await store.savePseudo('Bob');

      store.clearPseudo();

      expect(store.pseudoStatus()).toBe('idle');
    });
  });

  describe('changement d\'email', () => {
    it('demande le changement avec l\'adresse sans espaces autour', async () => {
      setup();

      await store.requestEmailChange(' nouveau@example.com ');

      expect(api.requestEmailChange).toHaveBeenCalledWith('nouveau@example.com');
      expect(store.emailStatus()).toBe('done');
    });

    it.each(['', 'pas-une-adresse', 'ALICE@example.com'])('n\'envoie pas « %s »', async email => {
      setup();

      await store.requestEmailChange(email);

      expect(api.requestEmailChange).not.toHaveBeenCalled();
    });

    it('garde l\'erreur d\'une adresse déjà utilisée', async () => {
      setup({ requestEmailChange: vi.fn(async () => Promise.reject(problem(409, 'players.email_taken'))) });

      await store.requestEmailChange('autre@example.com');

      expect(store.emailStatus()).toMatchObject({ error: { code: 'players.email_taken' } });
    });

    it('revient au repos quand le joueur retape', async () => {
      setup();
      await store.requestEmailChange('autre@example.com');

      store.clearEmailChange();

      expect(store.emailStatus()).toBe('idle');
    });
  });

  describe('déconnexion', () => {
    it('déconnecte ce navigateur et vide la session', async () => {
      setup();

      expect(await store.logout()).toBe(true);

      expect(api.logout).toHaveBeenCalledTimes(1);
      expect(session.player()).toBeNull();
      expect(store.logoutStatus()).toBe('done');
    });

    it('garde la session et l\'erreur quand la déconnexion échoue', async () => {
      setup({ logout: vi.fn(async () => Promise.reject(problem(500, 'common.unexpected'))) });

      expect(await store.logout()).toBe(false);

      expect(session.isLinked()).toBe(true);
      expect(store.logoutStatus()).toMatchObject({ error: { code: 'common.unexpected' } });
    });
  });
});
