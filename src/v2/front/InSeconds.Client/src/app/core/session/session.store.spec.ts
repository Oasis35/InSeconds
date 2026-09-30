import { TestBed } from '@angular/core/testing';
import { SessionStore } from './session.store';

describe('SessionStore', () => {
  let store: InstanceType<typeof SessionStore>;

  beforeEach(() => (store = TestBed.inject(SessionStore)));

  it('part sans joueur (visiteur qui n\'a rien démarré)', () => {
    expect(store.player()).toBeNull();
    expect(store.isKnown()).toBe(false);
    expect(store.isLinked()).toBe(false);
    expect(store.isAdmin()).toBe(false);
  });

  it('distingue un invité d\'un compte lié', () => {
    store.signedIn({ id: 'p1', pseudo: null, isGuest: true, isAdmin: false });
    expect(store.isKnown()).toBe(true);
    expect(store.isLinked()).toBe(false);

    store.signedIn({ id: 'p1', pseudo: 'Clem', isGuest: false, isAdmin: true });
    expect(store.isLinked()).toBe(true);
    expect(store.isAdmin()).toBe(true);
  });

  it('oublie le joueur à la déconnexion', () => {
    store.signedIn({ id: 'p1', pseudo: 'Clem', isGuest: false, isAdmin: true });

    store.signedOut();

    expect(store.player()).toBeNull();
    expect(store.isAdmin()).toBe(false);
  });

});
