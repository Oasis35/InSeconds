import { DestroyRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { ErrorReportingService } from '../errors/error-reporting.service';
import { isStaleChunkError, PAGE_RELOAD, ReloadMoment, SERVICE_WORKER_CONTAINER, VersionService } from './version.service';

describe('VersionService', () => {
  const READY: VersionEvent = { type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } };

  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<unknown>;
  let routerEvents: Subject<unknown>;
  let dialog: { afterOpened: Subject<unknown>; afterAllClosed: Subject<void>; openDialogs: unknown[] };
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let activateUpdate: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let visibility: DocumentVisibilityState;
  let workers: EventTarget & { controller: object | null; getRegistration: ReturnType<typeof vi.fn> };
  let updateWorker: ReturnType<typeof vi.fn>;
  let reportError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });

  afterEach(() => {
    delete (document as { visibilityState?: unknown }).visibilityState;
    sessionStorage.clear();
  });

  function create(isEnabled = true, controlled = true): VersionService {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    routerEvents = new Subject();
    dialog = { afterOpened: new Subject(), afterAllClosed: new Subject(), openDialogs: [] };
    checkForUpdate = vi.fn().mockResolvedValue(false);
    activateUpdate = vi.fn().mockResolvedValue(true);
    reload = vi.fn();
    updateWorker = vi.fn().mockResolvedValue(undefined);
    reportError = vi.fn();
    workers = Object.assign(new EventTarget(), {
      controller: controlled ? {} : null,
      getRegistration: vi.fn().mockResolvedValue({ update: updateWorker }),
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: { isEnabled, versionUpdates, unrecoverable, checkForUpdate, activateUpdate } },
        { provide: PAGE_RELOAD, useValue: reload },
        { provide: Router, useValue: { events: routerEvents } },
        { provide: Dialog, useValue: dialog },
        { provide: SERVICE_WORKER_CONTAINER, useValue: workers },
        { provide: ErrorReportingService, useValue: { report: reportError } },
      ],
    });
    return TestBed.inject(VersionService);
  }

  /** Une page qui déclare son moment ; `destroy()` simule sa destruction. */
  function page(service: VersionService, moment: () => ReloadMoment): { destroy: () => void } {
    const callbacks: (() => void)[] = [];
    const destroyRef = { onDestroy: (fn: () => void) => { callbacks.push(fn); return () => undefined; } } as unknown as DestroyRef;
    service.allowReload(moment, destroyRef);
    return { destroy: () => callbacks.forEach(fn => fn()) };
  }

  /** Laisse l'activation de la version (une promesse) se terminer avant le rechargement. */
  async function settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve));
  }

  function goToBackground(): void {
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function openDialog(): void {
    dialog.openDialogs.push({});
    dialog.afterOpened.next({});
  }

  function closeDialogs(): void {
    dialog.openDialogs.length = 0;
    dialog.afterAllClosed.next();
  }

  it('recharge tout de suite une nouvelle version prête quand la page le permet, sans bandeau', async () => {
    const service = create();
    page(service, () => 'now');

    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    TestBed.tick();
    expect(reload).not.toHaveBeenCalled();

    versionUpdates.next(READY);
    TestBed.tick();

    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(service.updateAvailable()).toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('ne recharge jamais en pleine manche, puis dès que la page redevient sûre', async () => {
    const service = create();
    const moment = signal<ReloadMoment>('navigation');
    page(service, moment);

    versionUpdates.next(READY);
    TestBed.tick();
    goToBackground();
    expect(reload).not.toHaveBeenCalled();

    moment.set('now');
    TestBed.tick();

    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recharge au passage en arrière-plan quand la page l\'accepte (récap)', async () => {
    const service = create();
    page(service, () => 'background');
    versionUpdates.next(READY);
    TestBed.tick();
    expect(reload).not.toHaveBeenCalled();

    goToBackground();

    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recharge au prochain changement de page, défaut d\'une page qui ne dit rien', async () => {
    const service = create();
    versionUpdates.next(READY);
    TestBed.tick();
    goToBackground();
    expect(service.moment()).toBe('navigation');
    expect(reload).not.toHaveBeenCalled();

    routerEvents.next(new NavigationEnd(1, '/admin', '/admin'));

    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ne recharge pas sur une navigation qui ne change que la query string (filtre ou page du pool admin)', async () => {
    create();
    routerEvents.next(new NavigationEnd(1, '/admin/catalogue', '/admin/catalogue'));
    versionUpdates.next(READY);
    TestBed.tick();

    routerEvents.next(new NavigationEnd(2, '/admin/catalogue?page=2', '/admin/catalogue?page=2'));
    routerEvents.next(new NavigationEnd(3, '/admin/catalogue?page=3#haut', '/admin/catalogue?page=3#haut'));
    expect(reload).not.toHaveBeenCalled();

    routerEvents.next(new NavigationEnd(4, '/admin/defis', '/admin/defis'));
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ne recharge rien au changement de page sans nouvelle version', () => {
    create();

    routerEvents.next(new NavigationEnd(1, '/daily', '/daily'));

    expect(reload).not.toHaveBeenCalled();
  });

  it('retient le moment le plus prudent des pages affichées', () => {
    const service = create();
    const daily = page(service, () => 'now');
    const busy = page(service, () => 'navigation');
    expect(service.moment()).toBe('navigation');

    busy.destroy();
    expect(service.moment()).toBe('now');

    daily.destroy();
    expect(service.moment()).toBe('navigation');
  });

  it('attend la fermeture d\'une fenêtre ouverte', async () => {
    const service = create();
    page(service, () => 'now');
    openDialog();

    versionUpdates.next(READY);
    TestBed.tick();
    routerEvents.next(new NavigationEnd(1, '/daily', '/daily'));
    expect(reload).not.toHaveBeenCalled();

    closeDialogs();
    TestBed.tick();

    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ne recharge pas deux fois de suite en moins d\'une minute : bandeau à la place', () => {
    sessionStorage.setItem('inseconds.version.autoReloadAt', String(Date.now() - 5_000));
    const service = create();
    page(service, () => 'now');

    versionUpdates.next(READY);
    TestBed.tick();

    expect(reload).not.toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(true);
    expect(reportError).toHaveBeenCalledExactlyOnceWith({ source: 'js', message: 'UpdatePrompt: reload-loop' });
  });

  it('retient l\'heure du rechargement automatique', () => {
    const service = create();
    page(service, () => 'now');

    versionUpdates.next(READY);
    TestBed.tick();

    expect(Number(sessionStorage.getItem('inseconds.version.autoReloadAt'))).toBeGreaterThan(0);
  });

  it('affiche le bandeau et recharge au moment sûr quand le service worker est dans un état irrécupérable', async () => {
    const service = create();
    const moment = signal<ReloadMoment>('navigation');
    page(service, moment);

    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'cache effacé' });
    TestBed.tick();
    expect(service.updateAvailable()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith({ source: 'js', message: 'UpdatePrompt: unrecoverable (cache effacé)' });

    moment.set('now');
    TestBed.tick();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('vérifie dès le démarrage s\'il existe une nouvelle version', () => {
    create();

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('vérifie s\'il existe une nouvelle version quand l\'onglet revient au premier plan', () => {
    create();
    checkForUpdate.mockClear();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('avale un échec de vérification (hors ligne)', async () => {
    create();
    checkForUpdate.mockRejectedValue(new Error('offline'));

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(checkForUpdate).toHaveBeenCalled();
  });

  it('recharge au moment sûr quand un nouveau service worker remplace l\'ancien (piège 49)', async () => {
    const service = create();
    const game = signal<ReloadMoment>('navigation');
    page(service, () => game());

    workers.dispatchEvent(new Event('controllerchange'));
    TestBed.tick();
    expect(reload).not.toHaveBeenCalled();

    game.set('now');
    TestBed.tick();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(service.updateAvailable()).toBe(false);
  });

  it('ne recharge pas quand le premier service worker prend la main (première visite)', () => {
    const service = create(true, false);
    page(service, () => 'now');

    workers.dispatchEvent(new Event('controllerchange'));
    TestBed.tick();

    expect(reload).not.toHaveBeenCalled();
  });

  it('demande la mise à jour du service worker dès le démarrage et au retour au premier plan', async () => {
    create();
    await vi.waitFor(() => expect(updateWorker).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(updateWorker).toHaveBeenCalledTimes(2));
  });

  it('avale un échec de la mise à jour du service worker', async () => {
    create();
    workers.getRegistration.mockRejectedValue(new Error('offline'));

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(reload).not.toHaveBeenCalled();
  });

  it('recharge depuis le bandeau à la demande', async () => {
    const service = create();

    service.reload();

    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('active la version prête avant de recharger, et recharge quand même si l\'activation échoue', async () => {
    const service = create();
    page(service, () => 'now');
    activateUpdate.mockRejectedValue(new Error('worker mort'));

    versionUpdates.next(READY);
    TestBed.tick();
    await settle();

    expect(activateUpdate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recharge une fois sur un module introuvable après un déploiement, pas deux fois de suite', async () => {
    const service = create();

    expect(service.reloadAfterStaleChunk()).toBe(true);
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);

    expect(service.reloadAfterStaleChunk()).toBe(false);
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reconnaît les messages de module introuvable de Chrome, Firefox et Safari', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://inseconds.cc/chunk-A.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module: https://inseconds.cc/chunk-A.js'))).toBe(true);
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isStaleChunkError(new Error('boom'))).toBe(false);
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(false);
  });

  it('laisse le joueur fermer le bandeau', () => {
    const service = create();
    service.markUpdateAvailable();

    service.dismiss();

    expect(service.updateAvailable()).toBe(false);
  });

  it('ne surveille rien quand le service worker est désactivé (dev, navigateur sans support)', () => {
    const service = create(false);
    page(service, () => 'now');

    versionUpdates.next(READY);
    document.dispatchEvent(new Event('visibilitychange'));
    routerEvents.next(new NavigationEnd(1, '/daily', '/daily'));
    TestBed.tick();

    expect(service.updateAvailable()).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(workers.getRegistration).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
