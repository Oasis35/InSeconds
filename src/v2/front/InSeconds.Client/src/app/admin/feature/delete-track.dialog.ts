import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ButtonComponent } from '../../ui/button/button.component';
import { ModalFrameComponent } from '../../ui/modal/modal-frame.component';
import { PoolStore } from '../data-access/pool.store';
import { PoolTrack, trackLabel } from '../domain/pool-track';

/**
 * Confirmer la suppression d'un ou plusieurs morceaux du pool. Seuls des morceaux jamais utilisés
 * arrivent ici (le tableau et la barre d'outils interdisent les autres) ; si l'API refuse quand
 * même (409 : un défi l'a utilisé entre-temps), la raison est affichée.
 */
@Component({
  selector: 'app-delete-track-dialog',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'admin.deleteModal.title' | translate">
      @if (tracks.length === 1) {
        <p class="text-sm" style="color:var(--text-light)">{{ 'admin.deleteModal.single' | translate: { track: label(tracks[0]) } }}</p>
      } @else {
        <p class="text-sm" style="color:var(--text-light)">{{ 'admin.deleteModal.multiple' | translate: { count: tracks.length } }}</p>
        <ul class="text-xs flex flex-col gap-0.5 max-h-36 overflow-y-auto rounded-lg p-3 mt-2" style="color:var(--text-muted);background:var(--bg-inactive)">
          @for (t of tracks; track t.id) {
            <li>{{ label(t) }}</li>
          }
        </ul>
      }

      @if (errorMessage(); as key) {
        <p role="alert" class="text-xs mt-2" style="color:var(--text-error)">{{ key | translate }}</p>
      }

      <div class="flex gap-2 pt-3">
        <button type="button" appButton variant="secondary" class="flex-1" (click)="close()">{{ 'admin.deleteModal.cancel' | translate }}</button>
        <button type="button" appButton variant="danger" class="flex-1" [disabled]="deleting()" (click)="confirm()">
          {{ (deleting() ? 'admin.deleteModal.deleting' : 'admin.deleteModal.delete') | translate }}
        </button>
      </div>
    </app-modal-frame>
  `,
})
export class DeleteTrackDialog {
  protected readonly tracks = inject<readonly PoolTrack[]>(DIALOG_DATA);
  protected readonly label = trackLabel;
  private readonly pool = inject(PoolStore);
  private readonly dialog = inject<DialogRef<boolean>>(DialogRef);

  protected readonly deleting = signal(false);
  private readonly errorCode = signal<string | null>(null);
  protected readonly errorMessage = computed(() => {
    const code = this.errorCode();
    return code === null ? null : code === '' ? 'admin.deleteModal.error' : errorMessageKey(code);
  });

  protected async confirm(): Promise<void> {
    this.deleting.set(true);
    this.errorCode.set(null);
    const error = await this.pool.remove(this.tracks.map(t => t.id));
    this.deleting.set(false);
    if (error) this.errorCode.set(error.code ?? '');
    else this.dialog.close(true);
  }

  protected close(): void {
    this.dialog.close(false);
  }
}
