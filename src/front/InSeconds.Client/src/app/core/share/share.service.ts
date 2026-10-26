import { Injectable, Injector, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ClipboardService } from '../clipboard/clipboard.service';
import { ErrorReportingService } from '../errors/error-reporting.service';
import { environment } from '../../../environments/environment';

/** Issue d'un partage : par le menu du téléphone, copié, menu fermé par le joueur, ou rien n'a marché. */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Le lien mis dans un texte partagé : l'adresse du site (celle du staging au staging), marquée `utm_source=share`. */
export const SHARE_LINK = `${environment.appUrl}/?utm_source=share`;

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly document = inject(DOCUMENT);
  private readonly clipboard = inject(ClipboardService);
  // Résolu à la demande (échec seulement), comme dans ClipboardService.
  private readonly injector = inject(Injector);

  /**
   * Le menu de partage du téléphone, sinon le texte copié dans le presse-papier. À appeler dans le clic, sans `await` avant :
   * le navigateur refuse `navigator.share` hors d'un geste du joueur. Sur ordinateur (pointeur fin), on copie toujours,
   * même si `navigator.share` existe (Chrome sous Windows, Safari sur Mac) : le menu du système y est moins pratique qu'un collage.
   */
  async share(text: string): Promise<ShareOutcome> {
    const view = this.document.defaultView;
    const navigator = view?.navigator;
    if (navigator?.share && view?.matchMedia?.('(pointer: coarse)').matches) {
      try {
        await navigator.share({ text });
        return 'shared';
      } catch (error) {
        // Le joueur a fermé le menu : rien à copier à sa place, rien à remonter.
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        // Jamais le texte partagé dans la remontée : seulement le type d'erreur.
        const name = error instanceof Error ? error.name : 'UnknownError';
        this.injector.get(ErrorReportingService).report({ source: 'js', message: `navigator.share failed (${name}), fallback to clipboard` });
      }
    }
    return (await this.clipboard.copy(text)) ? 'copied' : 'failed';
  }
}
