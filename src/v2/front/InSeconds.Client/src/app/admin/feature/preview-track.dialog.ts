import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalFrameComponent } from '../../ui/modal/modal-frame.component';
import { AudioPreviewPlayer } from '../data-access/audio-preview.player';
import { CatalogueApi } from '../data-access/catalogue.api';
import { PoolTrack } from '../domain/pool-track';

type PreviewStatus = 'loading' | 'ready' | 'error';

/**
 * Écouter l'extrait d'un morceau du pool. Le pool ne garde pas l'adresse de l'extrait (signée, elle
 * expire) : la fenêtre la redemande à Deezer. La lecture démarre d'elle-même, et **s'arrête à la
 * fermeture** : une réponse de Deezer qui arrive après la fermeture (ou après la réouverture sur un
 * autre morceau) ne relance pas l'audio (piège 42).
 */
@Component({
  selector: 'app-preview-track-dialog',
  imports: [TranslatePipe, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'admin.previewModal.title' | translate">
      <div class="flex flex-col gap-0.5">
        <p class="font-semibold text-sm" style="color:var(--text-hi)">{{ track.artist }}</p>
        <p class="text-xs" style="color:var(--text-muted)">{{ track.title }}</p>
      </div>

      <div class="mt-3">
        @switch (status()) {
          @case ('loading') {
            <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.previewModal.loading' | translate }}</p>
          }
          @case ('error') {
            <div class="rounded-xl px-4 py-3 text-xs text-center" style="background:var(--bg-inactive);color:var(--text-error)">
              {{ (unavailable() ? 'admin.previewModal.unavailable' : 'admin.previewModal.error') | translate }}
            </div>
          }
          @case ('ready') {
            <div class="flex items-center gap-4 rounded-xl px-4 py-3" style="background:var(--bg-inactive)">
              <button type="button" (click)="toggle()"
                class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors text-base"
                style="background:var(--bg-primary-dk);color:var(--text-on-primary)">
                {{ player.playing() ? '⏸' : '▶' }}
              </button>
              <div class="flex-1 flex flex-col gap-1">
                <div class="text-xs" style="color:var(--text-muted)">
                  {{ (player.playing() ? 'admin.previewModal.playing' : 'admin.previewModal.preview30s') | translate }}
                </div>
                <div class="w-full rounded-full h-1" style="background:var(--bg-surface-2)" role="progressbar" [attr.aria-valuenow]="player.progress()" aria-valuemin="0" aria-valuemax="100">
                  <div class="h-1 rounded-full transition-all" style="background:var(--text-indigo)" [style.width.%]="player.progress()"></div>
                </div>
              </div>
            </div>
          }
        }
      </div>

    </app-modal-frame>
  `,
})
export class PreviewTrackDialog {
  protected readonly track = inject<PoolTrack>(DIALOG_DATA);
  protected readonly player = inject(AudioPreviewPlayer);
  private readonly api = inject(CatalogueApi);

  protected readonly status = signal<PreviewStatus>('loading');
  /** L'échec vient de Deezer lui-même (panne, quota) et non d'un morceau sans extrait. */
  protected readonly unavailable = signal(false);
  private url: string | null = null;
  private closed = false;

  constructor() {
    // Un seul son à la fois : l'extrait que le panneau de recherche jouait s'arrête.
    this.player.stop();
    inject(DestroyRef).onDestroy(() => {
      this.closed = true;
      this.player.stop();
    });
    void this.load();
  }

  protected toggle(): void {
    this.player.toggle(this.url);
  }

  private async load(): Promise<void> {
    let url: string | null;
    try {
      url = await this.api.findPreviewUrl(this.track);
    } catch (error) {
      if (this.closed) return;
      this.unavailable.set((error as { status?: number }).status === 503);
      this.status.set('error');
      return;
    }
    // La fenêtre a été fermée pendant la recherche : surtout ne rien lancer.
    if (this.closed) return;
    if (!url) {
      this.status.set('error');
      return;
    }
    this.url = url;
    this.status.set('ready');
    this.player.toggle(url);
  }
}
