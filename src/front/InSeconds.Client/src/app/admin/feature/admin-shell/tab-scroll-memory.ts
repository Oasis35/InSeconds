import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, Scroll } from '@angular/router';

/** Le temps laissé à un onglet pour charger ses données (et retrouver sa hauteur) avant d'abandonner la reprise de la position. */
const RESTORE_TIMEOUT_MS = 1500;

/** L'onglet d'une adresse de l'admin (`/admin/joueurs?x=1` : `joueurs`), `null` hors de l'admin. */
export function adminTabOf(url: string): string | null {
  const match = /^\/admin\/([^/?#]+)/.exec(url);
  return match ? match[1] : null;
}

/**
 * Garde la position de défilement de chaque onglet de l'admin pendant la visite : on arrive en haut d'un onglet qu'on n'a pas encore
 * vu, on retrouve un onglet déjà vu là où on l'avait laissé. Un changement d'adresse dans le même onglet (mois, filtre) garde la règle
 * du site (retour en haut), un rechargement repart du haut. Le routeur remonte en haut à chaque navigation
 * (`scrollPositionRestoration: 'top'`) : la position gardée est remise à l'image suivante, après lui, puis à chaque image tant que
 * l'onglet n'a pas chargé de quoi défiler jusque-là (1,5 s au plus, et jamais contre l'admin qui fait défiler lui-même).
 */
export function rememberTabScroll(): void {
  const router = inject(Router);
  const view = inject(DOCUMENT).defaultView;
  if (!view) return;
  const positions = new Map<string, number>();
  let currentTab = adminTabOf(router.url);
  let pending = 0;
  const stop = () => view.cancelAnimationFrame(pending);
  // L'admin qui fait défiler lui-même reprend la main : la reprise s'arrête.
  const userInputs = ['wheel', 'touchstart', 'keydown'] as const;
  for (const type of userInputs) view.addEventListener(type, stop, { passive: true });
  inject(DestroyRef).onDestroy(() => {
    stop();
    for (const type of userInputs) view.removeEventListener(type, stop);
  });

  router.events.pipe(takeUntilDestroyed()).subscribe(event => {
    if (event instanceof NavigationStart) {
      if (currentTab) positions.set(currentTab, view.scrollY);
    } else if (event instanceof Scroll) {
      const url = 'urlAfterRedirects' in event.routerEvent ? event.routerEvent.urlAfterRedirects : event.routerEvent.url;
      const nextTab = adminTabOf(url);
      const changed = nextTab !== currentTab;
      currentTab = nextTab;
      stop();
      const target = nextTab ? positions.get(nextTab) ?? 0 : 0;
      // Le routeur remonte en haut sur ce même événement, après nous : la remise attend l'image suivante.
      if (changed && target > 0) {
        const startedAt = view.performance.now();
        pending = view.requestAnimationFrame(() => restore(target, startedAt));
      }
    }
  });

  function restore(target: number, startedAt: number): void {
    if (!view) return;
    const reachable = Math.max(view.document.documentElement.scrollHeight - view.innerHeight, 0);
    view.scrollTo({ top: Math.min(target, reachable), behavior: 'instant' });
    if (Math.abs(view.scrollY - target) <= 1 || view.performance.now() - startedAt > RESTORE_TIMEOUT_MS) return;
    pending = view.requestAnimationFrame(() => restore(target, startedAt));
  }
}
