import { ChangeDetectionStrategy, Component, DestroyRef, inject, input } from '@angular/core';
import { CdkDialogContainer, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';

let nextTitleId = 0;

/**
 * Cadre commun du contenu d'une modale ou d'un panneau bas : titre relié à la fenêtre pour les
 * lecteurs d'écran, bouton de fermeture, contenu projeté. Le focus, Échap, le fond cliquable et
 * le retour du focus sont gérés par le CDK Dialog (`ModalService`).
 */
@Component({
  selector: 'app-modal-frame',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal-frame.component.html',
})
export class ModalFrameComponent {
  readonly title = input.required<string>();

  protected readonly titleId = `app-modal-title-${nextTitleId++}`;
  private readonly dialogRef = inject(DialogRef);

  constructor() {
    // Relie la fenêtre à son titre (aria-labelledby), comme le fait MatDialogTitle.
    const container = this.dialogRef.containerInstance;
    if (container instanceof CdkDialogContainer) {
      container._addAriaLabelledBy(this.titleId);
      inject(DestroyRef).onDestroy(() => container._removeAriaLabelledBy(this.titleId));
    }
  }

  protected close(): void {
    this.dialogRef.close();
  }
}
