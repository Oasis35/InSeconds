import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SessionStore } from '../../core/session/session.store';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';
import { ADMIN_ALERTS_LOADER, ADMIN_STATUS_REFRESH_MS, ADMIN_STATUS_RETRY_MS, AdminStatus } from './admin-status';

describe('AdminStatus', () => {
  const adminPlayer = { id: 'a1', pseudo: 'Clem', email: 'c@x.fr', isGuest: false, isAdmin: true };
  const plainPlayer = { ...adminPlayer, isAdmin: false };

  function setup(loader: () => Promise<number> = vi.fn(async () => 2)) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ADMIN_ALERTS_LOADER, useValue: loader }] });
    const session = TestBed.inject(SessionStore);
    const chrome = TestBed.inject(ShellChromeStore);
    session.markLoaded();
    const status = TestBed.inject(AdminStatus);
    return { session, chrome, status, loader: loader as ReturnType<typeof vi.fn> };
  }

  /** Laisse l'effet d'identité partir, puis la lecture asynchrone se poser. */
  async function settle() {
    TestBed.tick();
    await vi.waitFor(() => undefined);
    await Promise.resolve();
  }

  afterEach(() => vi.useRealTimers());

  it("ne lit rien pour un invité ni pour un compte sans le rôle admin", async () => {
    const { session, chrome, loader } = setup();
    await settle();
    session.signedIn(plainPlayer);
    await settle();

    expect(loader).not.toHaveBeenCalled();
    expect(chrome.adminAlerts()).toBeNull();
  });

  it("lit le nombre d'alertes à l'arrivée d'un admin et le pose dans la coque", async () => {
    const { session, chrome, loader } = setup();
    session.signedIn(adminPlayer);
    await settle();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(chrome.adminAlerts()).toBe(2);
  });

  it("ne relit pas avant la période, puis relit au changement de page suivant", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { session, status, loader } = setup();
    session.signedIn(adminPlayer);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);

    await status.refresh();
    vi.setSystemTime(Date.now() + ADMIN_STATUS_REFRESH_MS - 1000);
    await status.refresh();
    expect(loader).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2000);
    await status.refresh();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("ne lit jamais onglet en arrière-plan", async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { session, chrome, loader } = setup();
    session.signedIn(adminPlayer);
    await settle();

    expect(loader).not.toHaveBeenCalled();
    expect(chrome.adminAlerts()).toBeNull();
  });

  it("ne lit pas sur une page de l'admin : sa coquille lit déjà l'état technique", async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'admin/catalogue', children: [] }]), { provide: ADMIN_ALERTS_LOADER, useValue: vi.fn(async () => 2) }],
    });
    await TestBed.inject(Router).navigateByUrl('/admin/catalogue');
    TestBed.inject(SessionStore).markLoaded();
    TestBed.inject(SessionStore).signedIn(adminPlayer);
    const chrome = TestBed.inject(ShellChromeStore);
    TestBed.inject(AdminStatus);
    await settle();

    expect(TestBed.inject(ADMIN_ALERTS_LOADER)).not.toHaveBeenCalled();
    expect(chrome.adminAlerts()).toBeNull();
  });

  it("ne lance pas deux lectures en même temps", async () => {
    let release: (alerts: number) => void = () => undefined;
    const slow = vi.fn(() => new Promise<number>(resolve => { release = resolve; }));
    const { session, status, chrome } = setup(slow);
    session.signedIn(adminPlayer);
    TestBed.tick();
    await status.refresh();
    expect(slow).toHaveBeenCalledTimes(1);

    release(0);
    await settle();
    expect(chrome.adminAlerts()).toBe(0);
  });

  it("une lecture de l'admin (report) vaut une lecture : la période repart de là", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { session, status, chrome, loader } = setup();
    session.signedIn(adminPlayer);
    await settle();
    vi.setSystemTime(Date.now() + ADMIN_STATUS_REFRESH_MS + 1000);

    status.report(5);
    await status.refresh();

    expect(chrome.adminAlerts()).toBe(5);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("un échec garde la valeur d'avant et réessaie bien avant la période normale", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const loader = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error('KO')).mockResolvedValue(3);
    const { session, status, chrome } = setup(loader);
    session.signedIn(adminPlayer);
    await settle();
    expect(chrome.adminAlerts()).toBeNull();

    await status.refresh();
    expect(loader).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + ADMIN_STATUS_RETRY_MS + 1000);
    await status.refresh();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(chrome.adminAlerts()).toBe(3);
  });

  it("efface le témoin quand le compte n'est plus admin", async () => {
    const { session, chrome } = setup();
    session.signedIn(adminPlayer);
    await settle();
    expect(chrome.adminAlerts()).toBe(2);

    session.signedIn(plainPlayer);
    await settle();

    expect(chrome.adminAlerts()).toBeNull();
  });
});
