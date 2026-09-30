import { Injectable, Injector, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ErrorReportingService } from './error-reporting.service';

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly document = inject(DOCUMENT);
  // Résolu à la demande (échec seulement) : évite d'imposer HttpClient à tous les consommateurs.
  private readonly injector = inject(Injector);

  // navigator.clipboard.writeText peut rejeter de façon intermittente (« Document is not focused »,
  // NotAllowedError sur mobile juste après la fermeture du clavier, cf. issue #200) : on retombe alors
  // sur l'ancienne copie par textarea + execCommand('copy'), encore dans la fenêtre du geste utilisateur.
  // Le Promise<boolean> évite au caller de gérer un rejet non catché.
  copy(text: string): Promise<boolean> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard?.writeText) return Promise.resolve(this.copyWithTextarea(text));

    return clipboard.writeText(text).then(() => true).catch((error: unknown) => {
      const copied = this.copyWithTextarea(text);
      // Jamais le texte copié dans la remontée : seulement le type d'erreur et l'issue du repli.
      const name = error instanceof Error ? error.name : 'UnknownError';
      this.injector.get(ErrorReportingService).report({
        source: 'js',
        message: `Clipboard writeText failed (${name}), fallback ${copied ? 'ok' : 'failed'}`,
      });
      return copied;
    });
  }

  private copyWithTextarea(text: string): boolean {
    const textarea = this.document.createElement('textarea');
    textarea.value = text;
    // readonly : pas de clavier virtuel ni de zoom iOS ; hors écran pour ne rien afficher.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    this.document.body.appendChild(textarea);

    const previousFocus = this.document.activeElement as HTMLElement | null;
    try {
      textarea.select();
      textarea.setSelectionRange(0, text.length); // iOS ignore select() seul
      return this.document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
      previousFocus?.focus?.();
    }
  }
}
