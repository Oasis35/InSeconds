import { DestroyRef, Injectable, InjectionToken, Injector, computed, effect, inject, signal, DOCUMENT } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter, fromEvent, map, merge } from 'rxjs';
import { ErrorReportingService } from '../errors/error-reporting.service';

/** Recharge la page. Jeton séparé pour que les tests n'aient pas à recharger le navigateur. */
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.location.reload();
  },
});

/**
 * Le conteneur des service workers du navigateur (`navigator.serviceWorker`), `null` sans support. Jeton séparé pour les tests.
 */
export const SERVICE_WORKER_CONTAINER = new InjectionToken<ServiceWorkerContainer | null>('SERVICE_WORKER_CONTAINER', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView?.navigator.serviceWorker ?? null,
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
const LAST_CHUNK_RELOAD_KEY = 'inseconds.version.chunkReloadAt';

/** Un module chargé à la demande qui n'existe plus (déploiement survenu pendant la visite), selon le navigateur. */
const STALE_CHUNK_PATTERN = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** L'erreur est un fichier JS introuvable parce que la page date d'avant le dernier déploiement. */
export function isStaleChunkError(error: unknown): boolean {
  return error instanceof Error && STALE_CHUNK_PATTERN.test(error.message);
}

/** Préfixe des lignes remontées quand le bandeau s'affiche, suivi de la raison (`unrecoverable` ou `reload-loop`). */
export const UPDATE_PROMPT_MESSAGE = 'UpdatePrompt';

/** Le chemin d'une adresse, sans query string ni fragment. */
function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

/**
 * Détection et application d'une nouvelle version du front, par le service worker d'Angular
 * plutôt qu'une comparaison maison avec `/health` :
 * - `VERSION_READY` : la nouvelle version est téléchargée ; elle est mise en attente et appliquée en rechargeant la page au
 *   premier moment sûr (bonne pratique web.dev / Angular : jamais sous les doigts du joueur) : tout de suite si la page l'accepte
 *   (`allowReload`), sinon quand l'onglet passe en arrière-plan ou au prochain changement de page (de chemin : une navigation
 *   qui ne change que la query string ne compte pas). Jamais avec une fenêtre ouverte ;
 * - au démarrage et au retour de l'onglet au premier plan : on vérifie s'il en existe une. Au démarrage, sans cet appel, le
 *   service worker attendait qu'il n'y ait plus de requête en cours pour vérifier (environ 25 s mesurées) ;
 * - remplacement du service worker lui-même (son script a changé, par exemple avec la CSP, piège 49) : le navigateur installe
 *   le nouveau en arrière-plan pendant la visite et la page reste servie par l'ancien jusqu'à `controllerchange`. Ce changement
 *   est traité comme une nouvelle version (même mise en attente, même moment sûr) : sans rechargement, une partie lancée avant
 *   restait sur l'ancien worker. La mise à jour du worker est demandée au démarrage et au retour au premier plan
 *   (`registration.update()`), pour qu'il soit remplacé le plus tôt possible. Le premier worker d'une page (première visite)
 *   n'est pas un remplacement : rien à recharger ;
 * - le rechargement active d'abord la version prête (`activateUpdate()`) : sans cela le service worker garde la page sur
 *   l'ancienne version après `reload()`, la nouvelle est annoncée de nouveau et le garde-fou ci-dessous affichait le bandeau ;
 * - un module chargé à la demande introuvable (`isStaleChunkError`, onglet resté ouvert pendant un déploiement) recharge la page
 *   une fois (`reloadAfterStaleChunk()`), sauf si cela vient déjà d'être fait ;
 * - état irrécupérable du service worker : `markUpdateAvailable()`, même mise en attente, plus le bandeau « Recharger / Plus tard » en secours ;
 * - garde-fou : un second rechargement automatique moins d'une minute après le précédent (déploiement cassé) n'a pas lieu,
 *   le bandeau s'affiche à la place ;
 * - chaque affichage du bandeau est remonté vers `/api/client-errors` (`UpdatePrompt: unrecoverable …` ou
 *   `UpdatePrompt: reload-loop`, avec la version du front) : le bandeau ne devrait jamais s'afficher, la ligne dit pourquoi.
 * Service worker désactivé (dev, tests, navigateur sans support) : rien n'est surveillé.
 */
@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly reloadPage = inject(PAGE_RELOAD);
  private readonly document = inject(DOCUMENT);
  private readonly workers = inject(SERVICE_WORKER_CONTAINER);
  private readonly injector = inject(Injector);

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

    if (this.workers) {
      let controlled = this.workers.controller !== null;
      fromEvent(this.workers, 'controllerchange')
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe(() => {
          if (controlled) this.pending.set(true);
          controlled = true;
        });
    }

    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(event => {
        this.reportPrompt(`unrecoverable (${event.reason})`);
        this.markUpdateAvailable();
      });

    fromEvent(this.document, 'visibilitychange')
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        if (this.document.visibilityState === 'visible') this.checkForUpdate();
        else if (this.moment() !== 'navigation') this.applyIfSafe();
      });

    // Un changement de page, pas une navigation qui ne touche que la query string ou le fragment (`?page=` du pool admin, filtre
    // en cours de saisie) : celle-là ne quitte rien, recharger couperait la saisie.
    let lastPath: string | null = null;
    inject(Router).events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map(event => pathOf(event.urlAfterRedirects)),
        filter(path => {
          const changed = path !== lastPath;
          lastPath = path;
          return changed;
        }),
        takeUntilDestroyed(destroyRef),
      )
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
    this.activateAndReload();
  }

  /**
   * Recharge la page après un module introuvable (déploiement pendant la visite). Faux, sans rien faire, si un rechargement pour
   * cette raison a eu lieu depuis moins d'une minute : le fichier manque alors vraiment, l'erreur est remontée comme les autres.
   */
  reloadAfterStaleChunk(): boolean {
    if (this.recentlyStored(LAST_CHUNK_RELOAD_KEY)) return false;
    this.store(LAST_CHUNK_RELOAD_KEY);
    this.activateAndReload();
    return true;
  }

  /** Active la version prête avant de recharger, sinon le service worker resservirait l'ancienne ; un échec n'empêche pas le rechargement. */
  private activateAndReload(): void {
    const reload = () => this.reloadPage();
    if (!this.swUpdate.isEnabled) {
      reload();
      return;
    }
    this.swUpdate.activateUpdate().catch(() => false).then(reload);
  }

  private applyIfSafe(): void {
    if (!this.pending() || this.dialogOpen()) return;
    if (this.reloadedRecently()) {
      if (!this._updateAvailable()) this.reportPrompt('reload-loop');
      this._updateAvailable.set(true);
      return;
    }
    this.store(LAST_AUTO_RELOAD_KEY);
    this.pending.set(false);
    this.activateAndReload();
  }

  /** Le bandeau va s'afficher : on le remonte avec sa raison (la version du front est ajoutée par le service). */
  private reportPrompt(reason: string): void {
    this.injector.get(ErrorReportingService).report({ source: 'js', message: `${UPDATE_PROMPT_MESSAGE}: ${reason}` });
  }

  private reloadedRecently(): boolean {
    return this.recentlyStored(LAST_AUTO_RELOAD_KEY);
  }

  private recentlyStored(key: string): boolean {
    try {
      const last = Number(sessionStorage.getItem(key));
      return Number.isFinite(last) && last > 0 && Date.now() - last < RELOAD_LOOP_WINDOW_MS;
    } catch {
      return false;
    }
  }

  private store(key: string): void {
    try {
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // Stockage indisponible (navigation privée) : on recharge quand même, sans garde-fou.
    }
  }

  private checkForUpdate(): void {
    // Un échec (hors ligne, serveur indisponible) n'est pas une erreur pour le joueur.
    this.swUpdate.checkForUpdate().catch(() => undefined);
    this.workers
      ?.getRegistration()
      .then(registration => registration?.update())
      .catch(() => undefined);
  }
}
