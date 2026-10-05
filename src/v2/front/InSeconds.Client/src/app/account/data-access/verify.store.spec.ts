import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { SessionLoader } from './session-loader';
import { VerifyStore } from './verify.store';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, problem, providePlayersApiFake } from './testing/fake-players-api';

describe('VerifyStore', () => {
  let api: FakePlayersApi;
  let store: InstanceType<typeof VerifyStore>;
  let loader: SessionLoader;

  function setup(overrides: Parameters<typeof fakePlayersApi>[0] = {}, { stubReload = true } = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [VerifyStore, providePlayersApiFake(api)] });
    store = TestBed.inject(VerifyStore);
    loader = TestBed.inject(SessionLoader);
    if (stubReload) vi.spyOn(loader, 'reload').mockResolvedValue();
  }

  it('attend le clic : ouvrir la page ne consomme rien', () => {
    setup();

    store.open('jeton');

    expect(store.step()).toEqual({ kind: 'idle' });
    expect(api.verifyMagicLink).not.toHaveBeenCalled();
  });

  it('signale un lien incomplet sans jeton', () => {
    setup();

    store.open(null);

    expect(store.step()).toEqual({ kind: 'missing-token' });
  });

  it('connecte un compte existant : relit l\'identité puis termine', async () => {
    setup();
    store.open('jeton');

    const pending = store.confirm('jeton');
    expect(store.step()).toEqual({ kind: 'confirming' });
    await pending;

    expect(api.verifyMagicLink).toHaveBeenCalledWith('jeton', undefined);
    expect(loader.reload).toHaveBeenCalledTimes(1);
    expect(store.step()).toEqual({ kind: 'done' });
  });

  it('demande le pseudo à la première connexion, sans relire l\'identité', async () => {
    setup({ verifyMagicLink: vi.fn(async () => ({ needsPseudo: true })) });
    store.open('jeton');

    await store.confirm('jeton');

    expect(store.step()).toEqual({ kind: 'needs-pseudo', problem: 'none' });
    expect(loader.reload).not.toHaveBeenCalled();
  });

  it('crée le compte avec le pseudo choisi, sans espaces autour', async () => {
    setup();
    store.open('jeton');

    await store.submitPseudo('jeton', '  Alice ');

    expect(api.verifyMagicLink).toHaveBeenCalledWith('jeton', 'Alice');
    expect(store.step()).toEqual({ kind: 'done' });
  });

  it('ramène à l\'étape du pseudo quand il est déjà pris', async () => {
    setup({ verifyMagicLink: vi.fn(async () => Promise.reject(problem(409, 'players.pseudo_taken'))) });
    store.open('jeton');

    await store.submitPseudo('jeton', 'Alice');

    expect(store.step()).toEqual({ kind: 'needs-pseudo', problem: 'taken' });
  });

  it('ramène à l\'étape du pseudo quand le serveur le refuse (400)', async () => {
    setup({ verifyMagicLink: vi.fn(async () => Promise.reject(problem(400, 'common.bad_request'))) });
    store.open('jeton');

    await store.submitPseudo('jeton', 'Alice');

    expect(store.step()).toEqual({ kind: 'needs-pseudo', problem: 'invalid' });
  });

  it('refuse un lien invalide, expiré ou déjà utilisé', async () => {
    setup({ verifyMagicLink: vi.fn(async () => Promise.reject(problem(400, 'players.invalid_or_expired_token'))) });
    store.open('jeton');

    await store.confirm('jeton');

    expect(store.step()).toEqual({ kind: 'invalid-link' });
    expect(store.error()?.code).toBe('players.invalid_or_expired_token');
  });

  it('laisse réessayer après une panne', async () => {
    setup({ verifyMagicLink: vi.fn(async () => Promise.reject({ isApiException: true, status: 0, response: '' })) });
    store.open('jeton');

    await store.confirm('jeton');

    expect(store.step()).toEqual({ kind: 'failed' });
    expect(store.error()?.code).toBe('common.network');
  });

  it('la connexion remplit la session via la relecture de l\'identité', async () => {
    setup({ getMe: vi.fn(async () => linkedPlayer) }, { stubReload: false });
    store.open('jeton');

    await store.confirm('jeton');

    expect(TestBed.inject(SessionStore).player()).toEqual(linkedPlayer);
  });
});
