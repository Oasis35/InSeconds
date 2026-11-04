import { DOCUMENT } from '@angular/common';
import { InjectionToken, Signal, inject, signal } from '@angular/core';

/** La largeur à partir de laquelle l'admin passe à sa mise en page PC (celle du préfixe `lg:` de Tailwind). */
export const WIDE_SCREEN_QUERY = '(min-width: 1024px)';

/**
 * Vrai sur un écran large (PC), suivi quand la fenêtre change de taille. Pour un écran qui a deux mises en page vraiment différentes
 * (un tableau sur PC, des cartes sur téléphone) : une seule est rendue, au lieu de deux dont l'une serait cachée par CSS. Un seul
 * écouteur pour toute l'application. Sans `matchMedia` (rendu hors navigateur), l'écran est étroit. Les tests le remplacent par un
 * `signal(true)` ou `signal(false)`.
 */
export const WIDE_SCREEN = new InjectionToken<Signal<boolean>>('WIDE_SCREEN', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    const media = typeof view?.matchMedia === 'function' ? view.matchMedia(WIDE_SCREEN_QUERY) : null;
    const wide = signal(media?.matches ?? false);
    media?.addEventListener('change', event => wide.set(event.matches));
    return wide.asReadonly();
  },
});
