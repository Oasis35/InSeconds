import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ChallengeTrackStats, rateColor } from '../domain/challenge';

/** Un morceau d'un défi : les taux (artiste, titre, prolongation, écoute moyenne) et l'icône de la répartition des temps. */
@Component({
  selector: 'app-challenge-track-stats',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = track();
    <div class="rounded-lg p-3 flex flex-col gap-2" style="background:var(--bg-inactive)">
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs font-medium" style="color:var(--text-hi)">{{ t.position }}. {{ t.artist }} — {{ t.title }}</p>
        <button type="button" (click)="showChart.emit(t)"
          class="shrink-0 -my-0.5 w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-white/[0.06]"
          style="color:var(--text-muted)" [attr.aria-label]="'admin.challenges.showChart' | translate">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
            <path d="M4 20V10M12 20V4M20 20v-7" />
          </svg>
        </button>
      </div>
      <div class="grid grid-cols-4 gap-2 text-xs">
        <div class="flex flex-col gap-0.5">
          <span style="color:var(--text-muted)">{{ 'admin.dashboard.artist' | translate }}</span>
          <span class="font-medium" [style.color]="color(t.artistCorrectRate)">{{ t.artistCorrectRate | number:'1.0-0' }}%</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span style="color:var(--text-muted)">{{ 'admin.dashboard.title' | translate }}</span>
          <span class="font-medium" [style.color]="color(t.titleCorrectRate)">{{ t.titleCorrectRate | number:'1.0-0' }}%</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span style="color:var(--text-muted)">{{ 'admin.dashboard.extended' | translate }}</span>
          <span class="font-medium" style="color:var(--text-light)">{{ t.extendedRate | number:'1.0-0' }}%</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span style="color:var(--text-muted)">{{ 'admin.dashboard.avgListen' | translate }}</span>
          <span class="font-medium" style="color:var(--text-light)">
            @if (t.avgListenedSeconds !== null) { {{ t.avgListenedSeconds }}s } @else { — }
          </span>
        </div>
      </div>
      <div class="w-full rounded-full h-1" style="background:var(--bg-surface-2)">
        <div class="h-1 rounded-full transition-all" [style.background]="color(t.titleCorrectRate)" [style.width.%]="t.titleCorrectRate"></div>
      </div>
    </div>
  `,
})
export class ChallengeTrackStatsComponent {
  readonly track = input.required<ChallengeTrackStats>();
  /** Demande la pop-up de la répartition des temps de ce morceau. */
  readonly showChart = output<ChallengeTrackStats>();

  protected readonly color = rateColor;
}
