import { TestBed } from '@angular/core/testing';
import { ConfirmEmailStore } from './confirm-email.store';
import { SessionLoader } from './session-loader';
import { FakePlayersApi, fakePlayersApi, problem, providePlayersApiFake } from './testing/fake-players-api';

describe('ConfirmEmailStore', () => {
  let api: FakePlayersApi;
  let store: InstanceType<typeof ConfirmEmailStore>;
  let loader: SessionLoader;

  function setup(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [ConfirmEmailStore, providePlayersApiFake(api)] });
    store = TestBed.inject(ConfirmEmailStore);
    loader = TestBed.inject(SessionLoader);
    vi.spyOn(loader, 'reload').mockResolvedValue();
  }

  it('confirme la nouvelle adresse puis relit l\'identité du navigateur', async () => {
    setup();

    await store.confirm('jeton');

    expect(api.confirmEmailChange).toHaveBeenCalledWith('jeton');
    expect(store.isFulfilled()).toBe(true);
    expect(store.confirmedEmail()).toBe('nouveau@example.com');
    expect(loader.reload).toHaveBeenCalledTimes(1);
  });

  it('garde le code d\'erreur d\'un lien invalide', async () => {
    setup({ confirmEmailChange: vi.fn(async () => Promise.reject(problem(400, 'players.invalid_or_expired_token'))) });

    await store.confirm('jeton');

    expect(store.isFulfilled()).toBe(false);
    expect(store.error()?.code).toBe('players.invalid_or_expired_token');
    expect(loader.reload).not.toHaveBeenCalled();
  });

  it('garde le code d\'erreur d\'une adresse prise entre-temps', async () => {
    setup({ confirmEmailChange: vi.fn(async () => Promise.reject(problem(409, 'players.email_taken'))) });

    await store.confirm('jeton');

    expect(store.error()?.code).toBe('players.email_taken');
  });
});
