import { TestBed } from '@angular/core/testing';
import { LoginStore } from './login.store';
import { FakePlayersApi, fakePlayersApi, problem, providePlayersApiFake } from './testing/fake-players-api';

describe('LoginStore', () => {
  let api: FakePlayersApi;
  let store: InstanceType<typeof LoginStore>;

  function setup(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [LoginStore, providePlayersApiFake(api)] });
    store = TestBed.inject(LoginStore);
  }

  it('envoie l\'adresse sans espaces autour et passe à « envoyé »', async () => {
    setup();

    const pending = store.requestLink('  alice@example.com ');
    expect(store.isPending()).toBe(true);
    await pending;

    expect(api.requestMagicLink).toHaveBeenCalledWith('alice@example.com');
    expect(store.isFulfilled()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.sentTo()).toBe('alice@example.com');
    expect(store.sentAt()).not.toBeNull();
    expect(store.resent()).toBe(false);
  });

  it('renvoie le lien à la même adresse', async () => {
    setup();
    await store.requestLink('alice@example.com');

    await store.resend();

    expect(api.requestMagicLink).toHaveBeenCalledTimes(2);
    expect(api.requestMagicLink).toHaveBeenLastCalledWith('alice@example.com');
    expect(store.resent()).toBe(true);
  });

  it('ne renvoie rien sans premier envoi', async () => {
    setup();

    await store.resend();

    expect(api.requestMagicLink).not.toHaveBeenCalled();
  });

  it('garde l\'adresse affichée si le renvoi échoue', async () => {
    setup();
    await store.requestLink('alice@example.com');
    api.requestMagicLink.mockRejectedValue(problem(429, 'common.too_many_requests'));

    await store.resend();

    expect(store.sentTo()).toBe('alice@example.com');
    expect(store.error()?.code).toBe('common.too_many_requests');
  });

  it('garde le code d\'erreur de la limite de débit (429)', async () => {
    setup({ requestMagicLink: vi.fn(async () => Promise.reject(problem(429, 'common.too_many_requests'))) });

    await store.requestLink('alice@example.com');

    expect(store.isFulfilled()).toBe(false);
    expect(store.error()).toMatchObject({ code: 'common.too_many_requests', status: 429 });
  });

  it('garde un code d\'erreur réseau quand le serveur ne répond pas', async () => {
    setup({ requestMagicLink: vi.fn(async () => Promise.reject({ isApiException: true, status: 0, response: '' })) });

    await store.requestLink('alice@example.com');

    expect(store.error()?.code).toBe('common.network');
  });
});
