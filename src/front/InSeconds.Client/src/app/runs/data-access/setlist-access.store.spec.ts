import { TestBed } from '@angular/core/testing';
import { SessionPlayer, SessionStore } from '../../core/session/session.store';
import { DAILY_DONE_LOADER } from '../../core/shell/daily-done-loader';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';
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

  it("arrivé directement sur la Setlist, il lit si le défi du jour est joué, sans écraser ce que la page du jeu du jour a dit", async () => {
    const daily = vi.fn(async () => true);
    TestBed.configureTestingModule({ providers: [{ provide: SETLIST_ACCESS_LOADER, useValue: async () => true }, { provide: DAILY_DONE_LOADER, useValue: daily }] });
    const chrome = TestBed.inject(ShellChromeStore);
    TestBed.inject(SessionStore).signedIn(account);
    const store = TestBed.inject(SetlistAccessStore);
    await store.ensureLoaded(true);
    for (let i = 0; i < 6; i++) { await TestBed.tick(); await Promise.resolve(); }

    expect(daily).toHaveBeenCalledTimes(1);
    expect(chrome.dailyDone()).toBe(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: SETLIST_ACCESS_LOADER, useValue: async () => true }, { provide: DAILY_DONE_LOADER, useValue: async () => true }] });
    const other = TestBed.inject(ShellChromeStore);
    other.setDailyDone(false);
    TestBed.inject(SessionStore).signedIn(account);
    await TestBed.inject(SetlistAccessStore).ensureLoaded(true);
    for (let i = 0; i < 6; i++) { await TestBed.tick(); await Promise.resolve(); }

    expect(other.dailyDone()).toBe(false);
  });
});
