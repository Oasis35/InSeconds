import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormField, FormRoot, form, maxLength, validate } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import { AppError } from '../../core/errors/app-error';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ButtonComponent } from '../../ui/button/button.component';
import { ModalFrameComponent } from '../../ui/modal/modal-frame.component';
import { PoolStore } from '../data-access/pool.store';
import { ARTIST_MAX_LENGTH, PoolTrack, TITLE_MAX_LENGTH, trackLabel } from '../domain/pool-track';

/**
 * Corriger l'artiste et le titre d'un morceau. Permis à tout moment, défi du jour compris : les
 * réponses déjà données gardent leur verdict, les suivantes sont corrigées avec le nouveau nom (la
 * fenêtre prévient quand le morceau est dans le défi du jour). Ne change jamais l'identifiant Deezer.
 */
@Component({
  selector: 'app-edit-track-dialog',
  imports: [FormField, FormRoot, TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'admin.editModal.title' | translate">
      @if (track.inTodayChallenge) {
        <p role="alert" class="text-xs rounded-lg px-3 py-2 mb-3"
          style="color:var(--color-warn);background:rgb(var(--rgb-warning) / 0.08);border:1px solid rgb(var(--rgb-warning) / 0.3)">
          ⚠ {{ 'admin.editModal.todayWarning' | translate }}
        </p>
      }

      <form class="flex flex-col gap-3" [formRoot]="nameForm" (submit)="save()">
        <div class="flex flex-col gap-1">
          <label for="edit-track-artist" class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.artist' | translate }}</label>
          <input id="edit-track-artist" type="text" cdkFocusInitial [formField]="nameForm.artist" class="app-input" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="edit-track-title" class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.titleField' | translate }}</label>
          <input id="edit-track-title" type="text" [formField]="nameForm.title" class="app-input" />
        </div>

        <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.hint' | translate }}</p>

        @if (errorMessage(); as key) {
          <p role="alert" class="text-xs" style="color:var(--text-error)">{{ key | translate }}</p>
        }

        <div class="flex gap-2 pt-1">
          <button type="button" appButton variant="secondary" class="flex-1" (click)="close()">{{ 'admin.editModal.cancel' | translate }}</button>
          <button type="submit" appButton class="flex-1" [disabled]="saveDisabled()">
            {{ (saving() ? 'admin.editModal.saving' : 'admin.editModal.save') | translate }}
          </button>
        </div>
      </form>

      <p class="text-[11px] mt-3" style="color:var(--text-faint)">{{ label }}</p>
    </app-modal-frame>
  `,
})
export class EditTrackDialog {
  protected readonly track = inject<PoolTrack>(DIALOG_DATA);
  protected readonly label = trackLabel(this.track);
  private readonly pool = inject(PoolStore);
  private readonly dialog = inject<DialogRef<boolean>>(DialogRef);

  /** Deux champs non vides une fois les espaces retirés, longueurs de l'API. */
  protected readonly nameForm = form(signal({ artist: this.track.artist, title: this.track.title }), path => {
    validate(path.artist, ({ value }) => (value().trim() ? null : { kind: 'required' }));
    validate(path.title, ({ value }) => (value().trim() ? null : { kind: 'required' }));
    maxLength(path.artist, ARTIST_MAX_LENGTH);
    maxLength(path.title, TITLE_MAX_LENGTH);
  });

  protected readonly saving = signal(false);
  private readonly error = signal<AppError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? errorMessageKey(error.code) : null;
  });

  /** Désactivé : un champ invalide, rien de changé, ou un envoi en cours. */
  protected readonly saveDisabled = computed(() => {
    const { artist, title } = this.nameForm().value();
    return this.nameForm().invalid() || this.saving()
      || (artist.trim() === this.track.artist && title.trim() === this.track.title);
  });

  protected async save(): Promise<void> {
    if (this.saveDisabled()) return;
    this.saving.set(true);
    this.error.set(null);
    const { artist, title } = this.nameForm().value();
    const error = await this.pool.rename(this.track.id, artist, title);
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.dialog.close(true);
  }

  protected close(): void {
    this.dialog.close(false);
  }
}
