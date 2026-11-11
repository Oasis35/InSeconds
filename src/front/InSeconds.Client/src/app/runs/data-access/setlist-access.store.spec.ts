import { TestBed } from '@angular/core/testing';
import { SessionPlayer, SessionStore } from '../../core/session/session.store';
import { SETLIST_ACCESS_LOADER, SetlistAccessStore } from './setlist-access.store';

describe('SetlistAccessStore', () => {
  const account: SessionPlayer = { id: 'p1', pseudo: 'Clem', email: 'c@x.fr', isGuest: false, isAdmin: false };
  const guest: SessionPlayer = { id: 'p2', pseudo: 'Invité', email: null, isGuest: true, isAdmin: false };

  function setup(loader: () => Promise<boolean>) {
    const spy = vi.fn(loader);
    TestBed.configureTestingModule({ providers: [{ provide: SETLIST_ACCESS_LOADER, useValue: spy }] });
    const session = TestBed.inject(SessionStore);
    const store = TestBed.inject(SetlistAccessStore);
    return { session, store, spy };
  }

  it("un compte qui a l'accès voit la V4", async () => {
    const { session, store, spy } = setup(async () => true);
    session.signedIn(account);
    await TestBed.tick();
    await Promise.resolve();
    await store.ensureLoaded(true);

    expect(store.hasAccess()).toBe(true);
    expect(store.loaded()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("sans accès, pas de V4", async () => {
    const { store } = setup(async () => false);
    await store.ensureLoaded(true);

    expect(store.hasAccess()).toBe(false);
    expect(store.loaded()).toBe(true);
  });

  it("un invité ne demande rien : pas d'accès, réponse immédiate", async () => {
    const { session, store, spy } = setup(async () => true);
    session.signedIn(guest);
    await store.ensureLoaded(session.isLinked());

    expect(spy).not.toHaveBeenCalled();
    expect(store.hasAccess()).toBe(false);
    expect(store.loaded()).toBe(true);
  });

  it("une erreur vaut « pas d'accès »", async () => {
    const { store } = setup(async () => {
      throw new Error('réseau');
    });
    await store.ensureLoaded(true);

    expect(store.hasAccess()).toBe(false);
    expect(store.loaded()).toBe(true);
  });

  it("la question n'est posée qu'une fois par compte", async () => {
    const { store, spy } = setup(async () => true);
    await store.ensureLoaded(true);
    await store.ensureLoaded(true);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
