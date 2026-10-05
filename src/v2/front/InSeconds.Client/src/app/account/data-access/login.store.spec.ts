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
