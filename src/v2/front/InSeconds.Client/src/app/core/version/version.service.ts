import { DestroyRef, Injectable, InjectionToken, inject, signal, DOCUMENT } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter, fromEvent } from 'rxjs';

/** Recharge la page. Jeton séparé pour que les tests n'aient pas à recharger le navigateur. */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Détection d'une nouvelle version du front, par le service worker d'Angular (§ 6.6 du plan v2)
 * plutôt qu'une comparaison maison avec `/health` :
 * - `VERSION_READY` : la nouvelle version est téléchargée, on propose de recharger ;
 * - retour de l'onglet au premier plan : on vérifie s'il en existe une ;
 * - état irrécupérable du service worker : on propose aussi de recharger ;
 * - code `common.new_version` renvoyé par l'API (anciennes routes) : `markUpdateAvailable()`.
 * Service worker désactivé (dev, tests, navigateur sans support) : rien n'est surveillé.
 */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly reloadPage = inject(PAGE_RELOAD);

  private readonly _updateAvailable = signal(false);
  readonly updateAvailable = this._updateAvailable.asReadonly();

  constructor() {
    if (!this.swUpdate.isEnabled) return;
    const destroyRef = inject(DestroyRef);
    const document = inject(DOCUMENT);

    this.swUpdate.versionUpdates
      .pipe(filter(event => event.type === 'VERSION_READY'), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.markUpdateAvailable());

    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.markUpdateAvailable());

    fromEvent(document, 'visibilitychange')
      .pipe(filter(() => document.visibilityState === 'visible'), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.checkForUpdate());
  }

  markUpdateAvailable(): void {
    this._updateAvailable.set(true);
  }

  /** Le joueur préfère finir ce qu'il fait : on ne repropose qu'à la prochaine détection. */
  dismiss(): void {
    this._updateAvailable.set(false);
  }

  reload(): void {
    this.reloadPage();
  }

  private checkForUpdate(): void {
    // Un échec (hors ligne, serveur indisponible) n'est pas une erreur pour le joueur.
    this.swUpdate.checkForUpdate().catch(() => undefined);
  }
}
