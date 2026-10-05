import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { SessionLoader } from './session-loader';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, providePlayersApiFake } from './testing/fake-players-api';

describe('SessionLoader', () => {
  let api: FakePlayersApi;
  let loader: SessionLoader;
  let session: InstanceType<typeof SessionStore>;

  function setup(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [providePlayersApiFake(api)] });
    loader = TestBed.inject(SessionLoader);
    session = TestBed.inject(SessionStore);
  }

  it('lit l\'identité une seule fois, même demandée plusieurs fois', async () => {
    setup({ getMe: vi.fn(async () => linkedPlayer) });

    await Promise.all([loader.ensureLoaded(), loader.ensureLoaded()]);
    await loader.ensureLoaded();

    expect(api.getMe).toHaveBeenCalledTimes(1);
    expect(session.player()).toEqual(linkedPlayer);
  });

  it('marque l’identité comme lue, même quand la lecture échoue', async () => {
    setup({ getMe: vi.fn(async () => Promise.reject(new Error('réseau'))) });
    expect(session.loaded()).toBe(false);

    await loader.ensureLoaded();

    expect(session.loaded()).toBe(true);
    expect(session.player()).toBeNull();
  });

  it('un navigateur sans identité reste sans joueur', async () => {
    setup();

    await loader.ensureLoaded();

    expect(session.player()).toBeNull();
  });

  it('relit l\'identité à la demande (après une connexion)', async () => {
    setup();
    await loader.ensureLoaded();
    api.getMe.mockResolvedValue(linkedPlayer as never);

    await loader.reload();

    expect(api.getMe).toHaveBeenCalledTimes(2);
    expect(session.isLinked()).toBe(true);
  });

  it('vide la session quand l\'identité a disparu (cookie révoqué)', async () => {
    setup({ getMe: vi.fn(async () => linkedPlayer) });
    await loader.ensureLoaded();
    api.getMe.mockResolvedValue(null as never);

    await loader.reload();

    expect(session.player()).toBeNull();
  });

  it('garde la session telle quelle quand la lecture échoue', async () => {
    setup({ getMe: vi.fn(async () => linkedPlayer) });
    await loader.ensureLoaded();
    api.getMe.mockRejectedValue(new Error('réseau') as never);

    await expect(loader.reload()).resolves.toBeUndefined();

    expect(session.player()).toEqual(linkedPlayer);
  });

  describe('ensureGuest', () => {
    it('crée l\'invité quand le navigateur n\'a aucune identité, puis relit l\'identité', async () => {
      setup();
      api.getMe.mockResolvedValueOnce(null as never).mockResolvedValueOnce({ ...linkedPlayer, isGuest: true } as never);

      await loader.ensureGuest();

      expect(api.createGuest).toHaveBeenCalledTimes(1);
      expect(api.getMe).toHaveBeenCalledTimes(2);
      expect(session.isKnown()).toBe(true);
    });

    it('ne crée rien quand une identité existe déjà', async () => {
      setup({ getMe: vi.fn(async () => linkedPlayer) });

      await loader.ensureGuest();

      expect(api.createGuest).not.toHaveBeenCalled();
    });

    it('abandonne sans erreur quand la création échoue (limite de débit, réseau)', async () => {
      setup({ createGuest: vi.fn(async () => Promise.reject(new Error('429'))) });

      await expect(loader.ensureGuest()).resolves.toBeUndefined();

      expect(api.getMe).toHaveBeenCalledTimes(1);
    });
  });
});
