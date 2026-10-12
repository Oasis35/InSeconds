import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, DOCUMENT } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter, fromEvent, map, merge } from 'rxjs';

/** Recharge la page. Jeton séparé pour que les tests n'aient pas à recharger le navigateur. */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Quand une page accepte qu'une nouvelle version s'applique (rechargement de la page), du plus permissif au plus prudent :
 * - `now` : tout de suite, rien n'est en cours (accueil, « déjà joué », confidentialité…) ;
 * - `background` : quand l'onglet passe en arrière-plan ou au prochain changement de page (récap de fin de partie) ;
 * - `navigation` : seulement au prochain changement de page (manche en cours, formulaires, admin). C'est le défaut d'une page
 *   qui ne dit rien.
 */
export type ReloadMoment = 'now' | 'background' | 'navigation';

const MOMENT_ORDER: readonly ReloadMoment[] = ['now', 'background', 'navigation'];

/** Deux rechargements automatiques à moins d'une minute d'écart : on soupçonne une boucle et on passe par le bandeau. */
const RELOAD_LOOP_WINDOW_MS = 60_000;
const LAST_AUTO_RELOAD_KEY = 'inseconds.version.autoReloadAt';

/**
 * Détection et application d'une nouvelle version du front, par le service worker d'Angular (§ 6.6 du plan v2)
 * plutôt qu'une comparaison maison avec `/health` :
 * - `VERSION_READY` : la nouvelle version est téléchargée ; elle est mise en attente et appliquée en rechargeant la page au
 *   premier moment sûr (bonne pratique web.dev / Angular : jamais sous les doigts du joueur) : tout de suite si la page l'accepte
 *   (`allowReload`), sinon quand l'onglet passe en arrière-plan ou au prochain changement de page. Jamais avec une fenêtre ouverte ;
 * - au démarrage et au retour de l'onglet au premier plan : on vérifie s'il en existe une. Au démarrage, sans cet appel, le
 *   service worker attendait qu'il n'y ait plus de requête en cours pour vérifier (environ 25 s mesurées) ;
 * - état irrécupérable du service worker, ou code `common.new_version` renvoyé par l'API (anciennes routes) :
 *   `markUpdateAvailable()`, même mise en attente, plus le bandeau « Recharger / Plus tard » en secours ;
 * - garde-fou : un second rechargement automatique moins d'une minute après le précédent (déploiement cassé) n'a pas lieu,
 *   le bandeau s'affiche à la place.
 * Service worker désactivé (dev, tests, navigateur sans support) : rien n'est surveillé.
 */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly reloadPage = inject(PAGE_RELOAD);
  private readonly document = inject(DOCUMENT);

  private readonly _updateAvailable = signal(false);
  /** Le bandeau « Recharger / Plus tard » est affiché. */
  readonly updateAvailable = this._updateAvailable.asReadonly();

  private readonly pending = signal(false);
  private readonly moments = signal<readonly (() => ReloadMoment)[]>([]);
  /** Le moment le plus prudent demandé par les pages affichées ; `navigation` si aucune ne s'est déclarée. */
  readonly moment = computed<ReloadMoment>(() => {
    const declared = this.moments().map(moment => moment());
    if (declared.length === 0) return 'navigation';
    return MOMENT_ORDER[Math.max(...declared.map(moment => MOMENT_ORDER.indexOf(moment)))];
  });

  private readonly dialogOpen: () => boolean;

  constructor() {
    const dialog = inject(Dialog);
    this.dialogOpen = toSignal(
      merge(dialog.afterOpened, dialog.afterAllClosed).pipe(map(() => dialog.openDialogs.length > 0)),
      { initialValue: dialog.openDialogs.length > 0 },
    );

    if (!this.swUpdate.isEnabled) return;
    const destroyRef = inject(DestroyRef);

    this.swUpdate.versionUpdates
      .pipe(filter(event => event.type === 'VERSION_READY'), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.pending.set(true));

    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.markUpdateAvailable());

    fromEvent(this.document, 'visibilitychange')
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        if (this.document.visibilityState === 'visible') this.checkForUpdate();
        else if (this.moment() !== 'navigation') this.applyIfSafe();
      });

    inject(Router).events
      .pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(destroyRef))
      .subscribe(() => this.applyIfSafe());

    effect(() => {
      if (this.pending() && this.moment() === 'now' && !this.dialogOpen()) this.applyIfSafe();
    });

    this.checkForUpdate();
  }

  /**
   * Déclare, pour la durée de vie de l'appelant (`destroyRef`), quand une nouvelle version peut s'appliquer. `moment` peut lire
   * des signaux : il est réévalué à chaque changement (ex. l'écran de la partie).
   */
  allowReload(moment: () => ReloadMoment, destroyRef: DestroyRef): void {
    this.moments.update(moments => [...moments, moment]);
    destroyRef.onDestroy(() => this.moments.update(moments => moments.filter(m => m !== moment)));
  }

  markUpdateAvailable(): void {
    this.pending.set(true);
    this._updateAvailable.set(true);
  }

  /** Le joueur préfère finir ce qu'il fait : le bandeau se ferme, la mise à jour reste en attente du prochain moment sûr. */
  dismiss(): void {
    this._updateAvailable.set(false);
  }

  reload(): void {
    this.reloadPage();
  }

  private applyIfSafe(): void {
    if (!this.pending() || this.dialogOpen()) return;
    if (this.reloadedRecently()) {
      this._updateAvailable.set(true);
      return;
    }
    this.rememberAutoReload();
    this.pending.set(false);
    this.reloadPage();
  }

  private reloadedRecently(): boolean {
    try {
      const last = Number(sessionStorage.getItem(LAST_AUTO_RELOAD_KEY));
      return Number.isFinite(last) && last > 0 && Date.now() - last < RELOAD_LOOP_WINDOW_MS;
    } catch {
      return false;
    }
  }

  private rememberAutoReload(): void {
    try {
      sessionStorage.setItem(LAST_AUTO_RELOAD_KEY, String(Date.now()));
    } catch {
      // Stockage indisponible (navigation privée) : on recharge quand même, sans garde-fou.
    }
  }

  private checkForUpdate(): void {
    // Un échec (hors ligne, serveur indisponible) n'est pas une erreur pour le joueur.
    this.swUpdate.checkForUpdate().catch(() => undefined);
  }
}
