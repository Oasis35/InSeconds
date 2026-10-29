import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { SessionStore } from '../../../core/session/session.store';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';
import { ProfileStore } from '../../data-access/profile.store';
import { samePseudo } from '../../domain/pseudo';

/**
 * Fenêtre « Supprimer ton compte ? » du profil : ce qui sera effacé, puis le pseudo à retaper (il
 * protège d'un toucher par erreur, le back le revérifie). Se ferme avec `true` une fois le compte
 * supprimé ; ouverte avec l'injecteur de la page pour retrouver son `ProfileStore`.
 */
@Component({
  selector: 'app-delete-account-dialog',
  imports: [TranslatePipe, ButtonComponent, ErrorMessageComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'account.profile.delete.title' | translate">
      <p>{{ 'account.profile.delete.body' | translate }}</p>
      <form class="mt-4 flex flex-col gap-2" (submit)="confirm($event)" novalidate>
        <label for="delete-account-pseudo" class="text-xs" style="color:var(--text-muted)">
          {{ 'account.profile.delete.label' | translate: { pseudo: pseudo() } }}
        </label>
        <input id="delete-account-pseudo" class="app-input w-full" autocomplete="off" autocapitalize="off" spellcheck="false"
          [value]="typed()" (input)="onInput($event)" />
        @if (error(); as error) {
          <app-error-message [messageKey]="errorKey()"
            [traceId]="error.code === 'players.pseudo_mismatch' ? null : error.traceId" />
        }
        <div class="flex gap-3 pt-3">
          <button appButton type="submit" variant="danger" class="flex-1" [disabled]="!canDelete()">
            {{ (pending() ? 'account.profile.delete.deleting' : 'account.profile.delete.confirm') | translate }}
          </button>
          <button appButton type="button" variant="secondary" class="flex-1" (click)="ref.close(false)">
            {{ 'account.profile.delete.cancel' | translate }}
          </button>
        </div>
      </form>
    </app-modal-frame>
  `,
})
export class DeleteAccountDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly profile = inject(ProfileStore);
  private readonly session = inject(SessionStore);

  protected readonly pseudo = computed(() => this.session.player()?.pseudo ?? '');
  protected readonly typed = signal('');
  protected readonly pending = computed(() => this.profile.deleteStatus() === 'pending');
  protected readonly error = computed(() => {
    const status = this.profile.deleteStatus();
    return typeof status === 'object' ? status.error : null;
  });
  protected readonly errorKey = computed(() => errorMessageKey(this.error()?.code));
  protected readonly canDelete = computed(() => samePseudo(this.typed(), this.pseudo()) && !this.pending());

  constructor() {
    this.profile.clearDelete();
  }

  protected onInput(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
    this.profile.clearDelete();
  }

  protected async confirm(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canDelete()) return;
    if (await this.profile.deleteAccount(this.typed())) this.ref.close(true);
  }
}
