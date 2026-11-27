import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../../ui/format/seconds.pipe';
import { StatsAnswers, percentOf } from '../../../domain/stats';

/** Les réponses de la période : part d'artistes et de titres trouvés, part avec indice, et combien de réponses à chaque palier d'écoute. */
@Component({
  selector: 'app-stats-answers',
  imports: [TranslatePipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (answers().total > 0) {
      <div class="flex flex-col gap-3" data-testid="stats-answers">
        <div class="grid grid-cols-3 gap-2 text-center">
          @for (tile of tiles(); track tile.labelKey) {
            <div class="rounded-lg py-2" style="background:var(--bg-surface)">
              <div class="text-xl font-semibold tabular-nums" [style.color]="tile.color">{{ tile.percent }} %</div>
              <div class="text-xs" style="color:var(--text-muted)">{{ tile.labelKey | translate }}</div>
            </div>
          }
        </div>
        <div class="flex flex-col gap-1" data-testid="listened-tiers">
          @for (bucket of answers().byListened; track bucket.seconds) {
            <div class="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2 text-xs">
              <span class="tabular-nums" style="color:var(--text-muted)">{{ bucket.seconds | appSeconds }}</span>
              <div class="h-2 rounded-full overflow-hidden" style="background:var(--text-sep)">
                <div class="h-full rounded-full" style="background:var(--color-accent-2)" [style.width.%]="(bucket.count / maxCount()) * 100"></div>
              </div>
              <span class="text-right tabular-nums">{{ bucket.count }}</span>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class StatsAnswersComponent {
  readonly answers = input.required<StatsAnswers>();

  protected readonly maxCount = computed(() => this.answers().byListened.reduce((max, b) => Math.max(max, b.count), 1));

  protected readonly tiles = computed(() => {
    const a = this.answers();
    return [
      { labelKey: 'admin.stats.artistFound', percent: percentOf(a.artistFound, a.total) ?? 0, color: 'var(--color-success)' },
      { labelKey: 'admin.stats.titleFound', percent: percentOf(a.titleFound, a.total) ?? 0, color: 'var(--color-accent-2)' },
      { labelKey: 'admin.stats.withHint', percent: percentOf(a.withHint, a.total) ?? 0, color: 'var(--color-warn)' },
    ];
  });
}
