import { DOCUMENT } from '@angular/common';
import { DestroyRef, EnvironmentProviders, Injectable, inject, provideEnvironmentInitializer } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ErrorReportingService } from '../errors/error-reporting.service';

/** Début du message remonté : c'est lui qu'on cherche dans Grafana. */
export const VIEWPORT_MESSAGE = 'Viewport';

/** Zoom au-delà duquel la page est dite zoomée (un arrondi de Safari ne compte pas). */
const ZOOM_THRESHOLD = 1.05;

/** Délai après un changement de page ou de zoom avant de mesurer : laisse la page se poser. */
const SETTLE_MS = 1000;

/** Rapports au plus par chargement de page : un joueur qui zoome lui-même n'épuise pas le quota de la remontée. */
const MAX_REPORTS = 3;

/** Ce que voit l'écran à un instant donné. */
export interface ViewportSnapshot {
  /** Zoom de Safari (`visualViewport.scale`), 1 sans zoom. */
  scale: number;
  /** Largeur de la mise en page (`clientWidth`). */
  layoutWidth: number;
  /** Largeur du contenu (`scrollWidth`) : plus que `layoutWidth` = un élément élargit la page. */
  pageWidth: number;
  /** L'élément qui a le focus (`INPUT[text]`…), `null` sur le corps de page. */
  focus: string | null;
  /** L'élément qui dépasse le plus à droite, s'il y en a un. */
  widest: string | null;
}

/**
 * Le message d'une page zoomée ou plus large que l'écran ; `null` si tout va bien. Zoom arrondi au
 * centième, largeurs au pixel : deux mesures semblables donnent le même message (dédupliqué).
 */
export function describeViewport(path: string, s: ViewportSnapshot): string | null {
  const zoomed = s.scale > ZOOM_THRESHOLD;
  const tooWide = s.pageWidth > s.layoutWidth + 1;
  if (!zoomed && !tooWide) return null;
  const parts = [
    `zoom ×${s.scale.toFixed(2)}`,
    `écran ${Math.round(s.layoutWidth)} px, page ${Math.round(s.pageWidth)} px`,
    `focus ${s.focus ?? 'aucun'}`,
  ];
  if (s.widest) parts.push(`plus large : ${s.widest}`);
  return `${VIEWPORT_MESSAGE}: ${path} ${parts.join(', ')}`;
}

/** Mesure l'écran du document. Ne parcourt les éléments que si la page déborde. */
export function measureViewport(document: Document): ViewportSnapshot {
  const window = document.defaultView;
  const root = document.documentElement;
  const layoutWidth = root.clientWidth;
  const pageWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0);
  return {
    scale: window?.visualViewport?.scale ?? 1,
    layoutWidth,
    pageWidth,
    focus: describeFocus(document.activeElement),
    widest: pageWidth > layoutWidth + 1 ? findWidest(document, layoutWidth) : null,
  };
}

function describeFocus(element: Element | null): string | null {
  if (!element || element === element.ownerDocument.body || element === element.ownerDocument.documentElement) return null;
  const type = element instanceof HTMLInputElement ? `[${element.type}]` : '';
  return `${element.tagName}${type}`;
}

/** L'élément qui dépasse le plus à droite de la largeur de mise en page : balise, classes, bords. */
function findWidest(document: Document, layoutWidth: number): string | null {
  let widest: Element | null = null;
  let right = layoutWidth + 1;
  for (const element of Array.from(document.body?.querySelectorAll('*') ?? [])) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.right > right) {
      right = rect.right;
      widest = element;
    }
  }
  if (!widest) return null;
  const rect = widest.getBoundingClientRect();
  const classes = (widest.getAttribute('class') ?? '').trim().replaceAll(/\s+/g, '.').slice(0, 80);
  return `${widest.tagName.toLowerCase()}${classes ? '.' + classes : ''} (${Math.round(rect.left)} → ${Math.round(rect.right)} px)`;
}

/**
 * Diagnostic de la recette iPhone (page zoomée à chaque page, 15/10/2026) : après chaque changement
 * de page et chaque changement de zoom, mesure l'écran et remonte à `POST /api/client-errors` une
 * page zoomée ou plus large que l'écran, avec le zoom, les largeurs, l'élément qui a le focus et
 * celui qui dépasse. Rien de personnel : chemin seul, aucun texte de la page. L'appareil est déduit
 * par l'API.
 */
@Injectable({ providedIn: 'root' })
export class ViewportReporter {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly reporting = inject(ErrorReportingService);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reports = 0;

  start(): void {
    const window = this.document.defaultView;
    if (!window) return;
    const sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.scheduleCheck());
    const onResize = () => this.scheduleCheck();
    window.visualViewport?.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      window.visualViewport?.removeEventListener('resize', onResize);
      if (this.timer !== null) clearTimeout(this.timer);
    });
  }

  /** Mesure tout de suite (tests) ; rend le message remonté, ou `null`. */
  check(): string | null {
    if (this.reports >= MAX_REPORTS) return null;
    const message = describeViewport(this.document.location?.pathname ?? '?', measureViewport(this.document));
    if (message) {
      this.reports++;
      this.reporting.report({ source: 'js', message });
    }
    return message;
  }

  private scheduleCheck(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check();
    }, SETTLE_MS);
  }
}

export function provideViewportReporting(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    inject(ViewportReporter).start();
  });
}
