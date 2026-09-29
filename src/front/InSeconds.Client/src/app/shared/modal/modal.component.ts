import {
  Component, ChangeDetectionStrategy, ElementRef, afterNextRender, input, output, viewChild, DestroyRef, inject,
} from '@angular/core';

/**
 * Fenêtre modale commune : fond cliquable, fermeture par Échap, focus déplacé dans la fenêtre à
 * l'ouverture puis rendu à l'élément d'origine à la fermeture. Le parent l'affiche avec un `@if`
 * (elle n'existe que tant qu'elle est ouverte) et projette son contenu.
 *
 * - `dialog` : fenêtre d'action de l'admin (écoute, renommage, suppression).
 * - `card` : petite carte d'information (histogrammes), fond flouté.
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  templateUrl: './modal.component.html',
})
export class ModalComponent {
  /** Libellé lu par les lecteurs d'écran sur le fond cliquable (« Fermer »). */
  readonly closeLabel = input.required<string>();
  readonly variant = input<'dialog' | 'card'>('dialog');
  /** Largeur maximale de la fenêtre (CSS). */
  readonly maxWidth = input('24rem');
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    afterNextRender(() => {
      // Un champ du contenu a pu prendre le focus lui-même (ex. champ Artiste du renommage).
      const panel = this.panel().nativeElement;
      if (!panel.contains(document.activeElement)) panel.focus();
    });
    inject(DestroyRef).onDestroy(() => previouslyFocused?.focus());
  }
}
