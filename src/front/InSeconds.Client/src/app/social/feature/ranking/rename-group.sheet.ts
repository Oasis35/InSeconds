import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';
import { GROUP_NAME_MAX, isGroupNameValid } from '../../domain/group';

export interface RenameGroupData {
  /** Le nom actuel du groupe. */
  name: string;
}

/**
 * La feuille « Renommer le groupe » du créateur : un champ prérempli du nom actuel, les mêmes règles qu'à la création. Rend le nouveau nom (rogné),
 * ou `null` s'il renonce ; rien ne part tant que le nom n'est pas valide.
 */
@Component({
  selector: 'app-rename-group-sheet',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'social.rename.title' | translate">
      <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); submit()">
        <label for="rename-group-name" class="text-sm" style="color:var(--text-light)">{{ 'social.rename.label' | translate }}</label>
        <input id="rename-group-name" type="text" class="app-input" autocomplete="off" spellcheck="false" #field
          [value]="draft()" (input)="draft.set(field.value)" [attr.maxlength]="maxLength" data-testid="rename-group-name" />
        <div class="flex gap-3 pt-2">
          <button appButton type="submit" variant="primary" class="flex-1" data-testid="rename-group-confirm" [disabled]="!valid()">
            {{ 'social.rename.confirm' | translate }}
          </button>
          <button appButton type="button" variant="secondary" class="flex-1" (click)="ref.close(null)">
            {{ 'social.rename.cancel' | translate }}
          </button>
        </div>
      </form>
    </app-modal-frame>
  `,
})
export class RenameGroupSheet {
  protected readonly data = inject<RenameGroupData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string | null>>(DialogRef);
  protected readonly maxLength = GROUP_NAME_MAX;
  protected readonly draft = signal(this.data.name);
  protected readonly valid = computed(() => isGroupNameValid(this.draft()) && this.draft().trim() !== this.data.name);

  protected submit(): void {
    if (this.valid()) this.ref.close(this.draft().trim());
  }
}
