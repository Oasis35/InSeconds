import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { SessionStore } from '../../core/session/session.store';
import { FakePlayersApi, fakePlayersApi, linkedPlayer, providePlayersApiFake } from '../data-access/testing/fake-players-api';
import { linkedAccountGuard } from './account.guards';

describe('linkedAccountGuard', () => {
  let api: FakePlayersApi;

  function run(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi(overrides);
    TestBed.configureTestingModule({ providers: [provideRouter([]), providePlayersApiFake(api)] });
    return TestBed.runInInjectionContext(() =>
      linkedAccountGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  }

  it('laisse passer un compte, une fois l\'identité lue', async () => {
    expect(await run({ getMe: vi.fn(async () => linkedPlayer) })).toBe(true);
    expect(TestBed.inject(SessionStore).isLinked()).toBe(true);
  });

  it('renvoie un invité vers la connexion', async () => {
    const result = await run({ getMe: vi.fn(async () => ({ ...linkedPlayer, isGuest: true, email: null })) });

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/account/login');
  });

  it('renvoie un visiteur sans identité vers la connexion', async () => {
    const result = await run();

    expect(String(result)).toBe('/account/login');
  });

  it('renvoie vers la connexion quand l\'identité ne peut pas être lue', async () => {
    const result = await run({ getMe: vi.fn(async () => Promise.reject(new Error('réseau'))) });

    expect(String(result)).toBe('/account/login');
  });
});
