import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatScore } from '../format/day-label';

/** Le résumé de toutes les parties du joueur sur un mode : leur nombre, leur moyenne, la meilleure (en orange : c'est le joueur). */
@Component({
  selector: 'app-history-summary',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="grid grid-cols-3 gap-3" data-testid="history-summary">
      <div>
        <dt class="text-xs" style="color:var(--text-muted)">{{ countKey() | translate }}</dt>
        <dd class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="history-count">{{ count() }}</dd>
      </div>
      <div>
        <dt class="text-xs" style="color:var(--text-muted)">{{ 'ui.history.average' | translate }}</dt>
        <dd class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="history-average">{{ format(average()) }}</dd>
      </div>
      <div>
        <dt class="text-xs" style="color:var(--text-muted)">{{ bestKey() | translate }}</dt>
        <dd class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)" data-testid="history-best">{{ format(best()) }}</dd>
      </div>
    </dl>
  `,
})
export class HistorySummaryComponent {
  readonly countKey = input.required<string>();
  readonly bestKey = input.required<string>();
  readonly count = input.required<number>();
  readonly average = input.required<number | null>();
  readonly best = input.required<number | null>();
  readonly locale = input('fr');

  protected format(score: number | null): string {
    return formatScore(score, this.locale());
  }
}
