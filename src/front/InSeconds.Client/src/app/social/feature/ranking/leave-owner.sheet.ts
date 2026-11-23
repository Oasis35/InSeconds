import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';

export interface LeaveOwnerData {
  /** Textes déjà traduits. */
  title: string;
  body: string;
  confirmLabel: string;
  /** Vrai quand l'action fait partir le créateur (rouge : destructif) ; faux pour un simple changement de créateur. */
  danger?: boolean;
  /** Les pseudos des autres membres : à qui le groupe peut passer. */
  members: readonly string[];
}

/**
 * Le choix du nouveau créateur d'un groupe, parmi les membres déjà dans le groupe : pour le créateur qui veut partir (il ne part pas sans avoir
 * choisi) comme pour celui qui veut seulement passer la main. Rend le pseudo choisi, ou `null` s'il renonce ; rien ne part tant qu'aucun membre
 * n'est choisi.
 */
@Component({
  selector: 'app-leave-owner-sheet',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="data.title">
      <p class="text-sm" style="color:var(--text-light)">{{ data.body }}</p>
      <div class="mt-4 flex flex-col gap-2" role="radiogroup" [attr.aria-label]="'social.leave.ownerChoose' | translate">
        @for (member of data.members; track member) {
          <button type="button" role="radio" data-testid="leave-successor" [attr.aria-checked]="choice() === member" (click)="choice.set(member)"
            class="flex items-center gap-3 rounded-(--radius-card) px-4 py-3 text-left cursor-pointer touch-manipulation"
            [style.border]="choice() === member ? '1px solid var(--color-accent-3)' : '1px solid var(--border-medium)'"
            [style.background]="choice() === member ? 'rgb(var(--rgb-accent-3) / 0.08)' : null">
            <span class="radio-dot" [class.radio-dot-on]="choice() === member" aria-hidden="true"></span>
            <span class="font-semibold min-w-0 truncate" style="color:var(--text-hi)">{{ member }}</span>
          </button>
        }
      </div>
      <div modalActions class="flex gap-3 pt-5">
        <button appButton type="button" [variant]="data.danger ? 'danger' : 'accent'" class="flex-1" data-testid="leave-owner-confirm" [disabled]="choice() === null" (click)="ref.close(choice())">
          {{ data.confirmLabel }}
        </button>
        <button appButton type="button" variant="secondary" class="flex-1" cdkFocusInitial (click)="ref.close(null)">
          {{ 'social.leave.cancel' | translate }}
        </button>
      </div>
    </app-modal-frame>
  `,
  styles: `
    .radio-dot { flex-shrink: 0; width: 1.25rem; height: 1.25rem; border-radius: 9999px; border: 2px solid var(--border-strong); }
    .radio-dot-on { border-color: var(--color-accent-3); box-shadow: inset 0 0 0 3px var(--bg-surface-2), inset 0 0 0 10px var(--color-accent-3); }
  `,
})
export class LeaveOwnerSheet {
  protected readonly data = inject<LeaveOwnerData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<string | null>>(DialogRef);
  protected readonly choice = signal<string | null>(null);
}
