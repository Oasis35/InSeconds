import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ReplayTrack, missOf } from '../../domain/replay';

/**
 * Un morceau à réécouter : pochette ronde, titre, artiste, ce qu'il a raté (en rouge : faux), et le rond cyan de l'écoute (le son), qui devient
 * pause quand son extrait joue. La page joue l'extrait.
 */
@Component({
  selector: 'app-replay-track-row',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-3 min-h-[68px] py-2" data-testid="replay-track">
      @if (track().coverUrl) {
        <img [src]="track().coverUrl" alt="" class="w-11 h-11 shrink-0 rounded-full object-cover" loading="lazy" />
      } @else {
        <span aria-hidden="true" class="w-11 h-11 shrink-0 rounded-full" style="background:var(--bg-surface-2)"></span>
      }
      <span class="flex-1 min-w-0 flex flex-col gap-0.5">
        <span class="text-sm font-semibold truncate" style="color:var(--text-hi)">{{ track().title }}</span>
        <span class="text-xs truncate" style="color:var(--text-muted)">{{ track().artist }}</span>
        <span class="text-[11px] font-semibold" style="color:var(--color-fail)" data-testid="replay-miss">{{ 'daily.replay.miss.' + miss() | translate }}</span>
      </span>
      <button type="button" (click)="listen.emit()" data-testid="replay-listen"
              class="w-11 h-11 shrink-0 rounded-full flex items-center justify-center touch-manipulation" style="border:1.5px solid var(--color-accent-2)"
              [style.background]="playing() ? 'var(--color-accent-2)' : null" [style.color]="playing() ? 'var(--bg-page)' : 'var(--color-accent-2)'"
              [attr.aria-label]="(playing() ? 'daily.archive.pause' : 'daily.archive.listenTo') | translate: { title: track().title }">
        @if (playing()) {
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" fill="currentColor"/><rect x="14" y="4" width="5" height="16" fill="currentColor"/></svg>
        } @else {
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4l14 8-14 8z" fill="currentColor"/></svg>
        }
      </button>
    </div>
  `,
})
export class ReplayTrackRowComponent {
  readonly track = input.required<ReplayTrack>();
  readonly playing = input(false);
  readonly listen = output();

  protected readonly miss = computed(() => missOf(this.track()));
}
