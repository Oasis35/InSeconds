import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionStore } from '../../core/session/session.store';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';
import { ADMIN_ALERTS_LOADER } from '../data-access/admin-status';
import { provideAdminStatus } from './provide-admin-status';
import { flushMicrotasks } from '../../core/testing/settle';

describe('provideAdminStatus', () => {
  const player = (isAdmin: boolean) => ({ id: 'p1', pseudo: 'Clem', email: 'c@x.fr', isGuest: false, isAdmin });

  async function start() {
    const loader = vi.fn(async () => 1);
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideAdminStatus(), { provide: ADMIN_ALERTS_LOADER, useValue: loader }] });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    return { loader, session: TestBed.inject(SessionStore), chrome: TestBed.inject(ShellChromeStore) };
  }

  it("ne charge ni ne lance rien pour un joueur qui n'est pas admin", async () => {
    const { loader, session, chrome } = await start();
    session.markLoaded();
    session.signedIn(player(false));
    TestBed.tick();
    // L'effet a tourné (`tick`) et ne lance rien : le chargement à la demande, s'il avait lieu, passerait par un `import()` du module
    // que ce fichier a déjà chargé, donc par les microtâches.
    await flushMicrotasks();

    expect(loader).not.toHaveBeenCalled();
    expect(chrome.adminAlerts()).toBeNull();
  });

  it("charge le lecteur à la demande dès qu'un admin est reconnu, et le témoin se pose", async () => {
    const { loader, session, chrome } = await start();
    session.markLoaded();
    session.signedIn(player(true));
    TestBed.tick();

    await vi.waitFor(() => expect(chrome.adminAlerts()).toBe(1));
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
