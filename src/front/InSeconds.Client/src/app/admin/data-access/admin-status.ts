import { DOCUMENT } from '@angular/common';
import { DestroyRef, EnvironmentInjector, Injectable, InjectionToken, createEnvironmentInjector, effect, inject, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SessionStore } from '../../core/session/session.store';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';

/** Entre deux lectures de l'état technique hors de l'admin : le témoin du bouton « Admin » n'a pas besoin d'être plus frais (6 appels à chaque fois). */
export const ADMIN_STATUS_REFRESH_MS = 15 * 60_000;
/** Après un échec de lecture : on réessaie plus tôt que la période normale, sans marteler. */
export const ADMIN_STATUS_RETRY_MS = 2 * 60_000;

/**
 * Lit le nombre d'alertes du panneau technique de l'admin, par le même `SystemStore` que l'admin (donc le même compte). Aucun client de l'API
 * n'est dans le bundle initial : ils se chargent ici à la demande, dans un injecteur à part détruit après la lecture. Un jeton pour que les
 * tests le remplacent.
 */
export const ADMIN_ALERTS_LOADER = new InjectionToken<() => Promise<number>>('ADMIN_ALERTS_LOADER', {
  factory: () => {
    const parent = inject(EnvironmentInjector);
    return async () => {
      const [{ SystemStore }, { provideAdminApi }] = await Promise.all([import('./system.store'), import('./admin-api.providers')]);
      const injector = createEnvironmentInjector([provideAdminApi(), SystemStore], parent);
      try {
        const system = injector.get(SystemStore);
        await system.load();
        return system.alerts();
      } finally {
        injector.destroy();
      }
    };
  },
});

/**
 * Le témoin du bouton « Admin » de l'en-tête : le nombre d'alertes du panneau technique, posé dans `ShellChromeStore.adminAlerts` pour que
 * `core` le lise sans connaître l'admin. Pour un compte admin seulement. Lecture espacée, pour ne pas charger l'API et GitHub (60 lectures
 * par heure et par IP) pour une pastille : une fois à l'arrivée, puis au plus toutes les `ADMIN_STATUS_REFRESH_MS`, jamais onglet en arrière-plan,
 * jamais dans l'admin (sa coquille lit déjà tout et le dit par `report`, ce qui repart la période de zéro). Les moments de relecture sont un
 * changement de page et le retour au premier plan ; une lecture en échec ne montre rien de nouveau.
 */
@Injectable({ providedIn: 'root' })
export class AdminStatus {
  private readonly session = inject(SessionStore);
  private readonly chrome = inject(ShellChromeStore);
  private readonly loader = inject(ADMIN_ALERTS_LOADER);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  /** L'instant de la dernière lecture (ou du moment où réessayer, après un échec, décalé pour que la période restante soit courte) ; `null` : jamais lu. */
  private lastReadAt: number | null = null;
  private reading = false;

  constructor() {
    effect(() => {
      // L'identité se lit au démarrage de l'app : tant qu'elle n'est pas connue, on ne conclut rien.
      if (!this.session.loaded()) return;
      const admin = this.session.isAdmin();
      untracked(() => {
        if (admin) {
          void this.refresh();
        } else {
          this.lastReadAt = null;
          this.chrome.setAdminAlerts(null);
        }
      });
    });
    const navigations = this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => void this.refresh());
    const onVisible = () => void this.refresh();
    this.doc.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      navigations.unsubscribe();
      this.doc.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** La coquille de l'admin a lu l'état technique : son résultat vaut une lecture, la période repart de là. */
  report(alerts: number): void {
    this.lastReadAt = Date.now();
    this.chrome.setAdminAlerts(alerts);
  }

  /** Relit si c'est le moment : admin reconnu, hors de l'admin, au premier plan, et la dernière lecture date de plus de la période. */
  async refresh(): Promise<void> {
    if (this.reading || !this.session.isAdmin() || this.doc.visibilityState === 'hidden' || this.inAdmin()) return;
    if (this.lastReadAt !== null && Date.now() - this.lastReadAt < ADMIN_STATUS_REFRESH_MS) return;
    this.reading = true;
    try {
      const alerts = await this.loader();
      // Le compte a pu changer pendant la lecture : un résultat d'un autre compte ne se pose pas.
      if (this.session.isAdmin()) this.report(alerts);
    } catch {
      this.lastReadAt = Date.now() - ADMIN_STATUS_REFRESH_MS + ADMIN_STATUS_RETRY_MS;
    } finally {
      this.reading = false;
    }
  }

  /**
   * Sur une page de l'admin, sa coquille lit déjà l'état technique : on ne le lit pas en double. L'adresse du navigateur dit où l'on arrive
   * (le routeur n'a pas fini sa première navigation quand l'identité est lue), celle du routeur où l'on est ensuite.
   */
  private inAdmin(): boolean {
    return [this.doc.defaultView?.location.pathname ?? '', this.router.url.split(/[?#]/)[0]]
      .some(path => path === '/admin' || path.startsWith('/admin/'));
  }
}
