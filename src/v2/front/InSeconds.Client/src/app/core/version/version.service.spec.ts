import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PAGE_RELOAD, VersionService } from './version.service';

describe('VersionService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<unknown>;
  let checkForUpdate: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;

  function create(isEnabled = true): VersionService {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    checkForUpdate = vi.fn().mockResolvedValue(false);
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: { isEnabled, versionUpdates, unrecoverable, checkForUpdate } },
        { provide: PAGE_RELOAD, useValue: reload },
      ],
    });
    return TestBed.inject(VersionService);
  }

  it('propose de recharger quand une nouvelle version est prête', () => {
    const service = create();

    versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } });
    expect(service.updateAvailable()).toBe(false);

    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    expect(service.updateAvailable()).toBe(true);
  });

  it('propose de recharger quand le service worker est dans un état irrécupérable', () => {
    const service = create();

    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'cache effacé' });

    expect(service.updateAvailable()).toBe(true);
  });

  it('vérifie dès le démarrage s\'il existe une nouvelle version', () => {
    create();

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('vérifie s\'il existe une nouvelle version quand l\'onglet revient au premier plan', () => {
    create();
    checkForUpdate.mockClear();

    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.visibilityState).toBe('visible');
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('avale un échec de vérification (hors ligne)', async () => {
    create();
    checkForUpdate.mockRejectedValue(new Error('offline'));

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();

    expect(checkForUpdate).toHaveBeenCalled();
  });

  it('recharge la page à la demande, jamais d\'office', () => {
    const service = create();
    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    expect(reload).not.toHaveBeenCalled();

    service.reload();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('laisse le joueur remettre à plus tard', () => {
    const service = create();
    service.markUpdateAvailable();

    service.dismiss();

    expect(service.updateAvailable()).toBe(false);
  });

  it('ne surveille rien quand le service worker est désactivé (dev, navigateur sans support)', () => {
    const service = create(false);

    versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(service.updateAvailable()).toBe(false);
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('reste utilisable par le code new_version même sans service worker', () => {
    const service = create(false);

    service.markUpdateAvailable();

    expect(service.updateAvailable()).toBe(true);
  });
});
