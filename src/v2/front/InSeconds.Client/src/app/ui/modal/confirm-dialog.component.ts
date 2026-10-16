import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ButtonComponent } from '../button/button.component';
import { ModalFrameComponent } from './modal-frame.component';

export interface ConfirmDialogData {
  /** Textes déjà traduits. */
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` : action destructive (abandonner, supprimer). */
  tone?: 'danger' | 'default';
}

/**
 * Confirmation en panneau bas (remplace `ConfirmSheetComponent` de la v1). Le bouton
 * d'annulation, mis en avant, reçoit le focus : Entrée par réflexe ne détruit rien.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="data.title">
      <p style="white-space:pre-line">{{ data.body }}</p>
      <div modalActions class="flex gap-3 pt-5">
        <button appButton type="button" [variant]="data.tone === 'danger' ? 'danger' : 'primary'" class="flex-1"
          (click)="ref.close(true)">
          {{ data.confirmLabel }}
        </button>
        <button appButton type="button" variant="secondary" class="flex-1" cdkFocusInitial (click)="ref.close(false)">
          {{ data.cancelLabel }}
        </button>
      </div>
    </app-modal-frame>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
