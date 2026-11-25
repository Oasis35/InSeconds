import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { AppError } from '../../../../core/errors/app-error';
import { errorMessageKey } from '../../../../core/errors/error-messages';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../../ui/modal/modal-frame.component';
import { ModalService } from '../../../../ui/modal/modal.service';
import { PreviewTrackDialog } from '../../../../core/audio-preview/preview-track.dialog';
import { CatalogueApi } from '../../../data-access/catalogue.api';
import { PoolStore } from '../../../data-access/pool.store';
import { DeezerResult, PoolTrack, trackLabel } from '../../../domain/pool-track';

const PREVIEW_MAX_WIDTH = '26rem';

type SearchStatus = 'loading' | 'ready' | 'error';

/**
 * Remplacer un morceau dont Deezer n'a plus d'extrait par une autre version du même titre qui en a un. Les versions viennent de la recherche
 * « artiste titre » de Deezer (celles qui ont un extrait, sans le morceau lui-même) ; le choix reprend l'identifiant, la pochette,
 * l'année, le rang et l'extrait de la version choisie, et les noms sauf si le morceau a déjà servi (l'historique les montre). Thèmes et titres
 * alternatifs sont gardés. Refusé par l'API pour le morceau du défi du jour.
 */
@Component({
  selector: 'app-replace-track-dialog',
  imports: [TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'admin.replaceModal.title' | translate">
      <p class="text-xs mb-3" style="color:var(--text-muted)">{{ label }}</p>
      <p class="text-xs mb-3" style="color:var(--text-muted)">{{ 'admin.replaceModal.hint' | translate }}</p>

      @switch (status()) {
        @case ('loading') {
          <p class="text-xs" style="color:var(--text-muted)" data-testid="replace-loading">{{ 'admin.replaceModal.loading' | translate }}</p>
        }
        @case ('error') {
          <p class="text-xs" role="alert" style="color:var(--text-error)" data-testid="replace-search-error">{{ 'admin.replaceModal.searchError' | translate }}</p>
        }
        @case ('ready') {
          @if (candidates().length === 0) {
            <p class="text-xs" style="color:var(--text-muted)" data-testid="replace-empty">{{ 'admin.replaceModal.empty' | translate }}</p>
          } @else {
            <ul class="flex flex-col gap-2 max-h-72 overflow-y-auto" data-testid="replace-candidates">
              @for (candidate of candidates(); track candidate.deezerTrackId) {
                <li class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="border:1px solid var(--border-medium)">
                  <button type="button" (click)="listen(candidate)" class="text-xs px-2 py-1 rounded shrink-0"
                    style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)"
                    [title]="'admin.pool.listenTitle' | translate" [attr.aria-label]="'admin.pool.listenTitle' | translate">▶</button>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold truncate" style="color:var(--text-hi)">{{ candidate.title }}</p>
                    <p class="text-xs truncate" style="color:var(--text-muted)">{{ candidate.artist }}</p>
                  </div>
                  <button type="button" appButton variant="accent" size="sm" data-testid="replace-choose" [disabled]="saving()"
                    (click)="choose(candidate)">{{ 'admin.replaceModal.choose' | translate }}</button>
                </li>
              }
            </ul>
          }
        }
      }

      @if (errorMessage(); as key) {
        <p role="alert" class="text-xs mt-3" style="color:var(--text-error)" data-testid="replace-error">{{ key | translate }}</p>
      }

      <div class="flex gap-2 pt-3">
        <button type="button" appButton variant="secondary" class="flex-1" (click)="close()">{{ 'admin.replaceModal.cancel' | translate }}</button>
      </div>
    </app-modal-frame>
  `,
})
export class ReplaceTrackDialog implements OnInit {
  protected readonly track = inject<PoolTrack>(DIALOG_DATA);
  protected readonly label = trackLabel(this.track);
  private readonly pool = inject(PoolStore);
  private readonly catalogue = inject(CatalogueApi);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  private readonly dialog = inject<DialogRef<boolean>>(DialogRef);

  protected readonly status = signal<SearchStatus>('loading');
  protected readonly candidates = signal<readonly DeezerResult[]>([]);
  protected readonly saving = signal(false);
  private readonly error = signal<AppError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? errorMessageKey(error.code) : null;
  });

  async ngOnInit(): Promise<void> {
    try {
      this.candidates.set(await this.catalogue.findReplacements(this.track));
      this.status.set('ready');
    } catch {
      this.status.set('error');
    }
  }

  protected listen(candidate: DeezerResult): void {
    this.modal.open(PreviewTrackDialog, { data: candidate, maxWidth: PREVIEW_MAX_WIDTH, injector: this.injector });
  }

  protected async choose(candidate: DeezerResult): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const error = await this.pool.replaceSource(this.track.id, candidate.deezerTrackId);
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.dialog.close(true);
  }

  protected close(): void {
    this.dialog.close(false);
  }
}
