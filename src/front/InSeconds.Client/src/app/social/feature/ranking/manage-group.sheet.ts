import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';

/** Ce que le créateur choisit de faire sur son groupe. */
export type ManageGroupChoice = 'rename' | 'transfer';

export interface ManageGroupData {
  /** Changer de créateur n'a de sens que s'il y a d'autres membres. */
  canTransfer: boolean;
}

/**
 * La feuille « Gérer le groupe » du créateur : ce qu'il est seul à pouvoir faire (renommer, changer de créateur), une ligne chacun. Rend le choix,
 * ou `null` s'il ferme ; « Quitter le groupe » n'y est pas : c'est une action de tout membre, qui reste en bas de la page.
 */
@Component({
  selector: 'app-manage-group-sheet',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'social.manage.title' | translate">
      <div class="flex flex-col gap-2">
        <button type="button" data-testid="manage-rename" (click)="ref.close('rename')"
          class="flex flex-col gap-0.5 rounded-(--radius-card) px-4 py-3 text-left cursor-pointer touch-manipulation min-h-11"
          style="border:1px solid var(--border-medium)">
          <span class="font-semibold" style="color:var(--text-hi)">{{ 'social.manage.rename' | translate }}</span>
          <span class="text-sm" style="color:var(--text-light)">{{ 'social.manage.renameHint' | translate }}</span>
        </button>
        @if (data.canTransfer) {
          <button type="button" data-testid="manage-transfer" (click)="ref.close('transfer')"
            class="flex flex-col gap-0.5 rounded-(--radius-card) px-4 py-3 text-left cursor-pointer touch-manipulation min-h-11"
            style="border:1px solid var(--border-medium)">
            <span class="font-semibold" style="color:var(--text-hi)">{{ 'social.manage.transfer' | translate }}</span>
            <span class="text-sm" style="color:var(--text-light)">{{ 'social.manage.transferHint' | translate }}</span>
          </button>
        }
      </div>
      <div modalActions class="flex pt-5">
        <button appButton type="button" variant="secondary" class="flex-1" cdkFocusInitial (click)="ref.close(null)">
          {{ 'social.manage.close' | translate }}
        </button>
      </div>
    </app-modal-frame>
  `,
})
export class ManageGroupSheet {
  protected readonly data = inject<ManageGroupData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ManageGroupChoice | null>>(DialogRef);
}
