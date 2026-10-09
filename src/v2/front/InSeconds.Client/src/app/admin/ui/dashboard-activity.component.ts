import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Day, DayActivity, activityBarHeightPx, formatDayShort } from '../domain/dashboard';

/** Activité des 30 derniers jours : une barre par jour, un clic sélectionne le jour. */
@Component({
  selector: 'app-dashboard-activity',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-5 flex flex-col gap-3" style="background:var(--bg-surface)">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.activity30d' | translate }}</h2>
        <p class="text-xs" style="color:var(--text-faint)">
          {{ 'admin.dashboard.total' | translate }} <span class="font-medium" style="color:var(--text-hi)">{{ total() }}</span> —
          {{ 'admin.dashboard.peak' | translate }} <span class="font-medium" style="color:var(--text-hi)">{{ peak() }}</span>{{ 'admin.dashboard.perDay' | translate }}
        </p>
      </div>
      @if (peak() === 0) {
        <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.noCompletedInPeriod' | translate }}</p>
      } @else {
        <div class="flex items-end gap-px h-16">
          @for (item of activity(); track item.day) {
            <button type="button" (click)="select.emit(item.day)"
              class="flex-1 flex flex-col items-center group relative"
              data-testid="dashboard-activity-bar"
              [attr.title]="item.day + ' : ' + item.playerCount + ' ' + ((item.playerCount > 1 ? 'admin.dashboard.players' : 'admin.dashboard.player') | translate)">
              <div class="w-full rounded-sm transition-all"
                [style.background]="barColor(item)"
                [style.height.px]="barHeight(item.playerCount)">
              </div>
            </button>
          }
        </div>
        <div class="flex justify-between text-xs" style="color:var(--text-sep)">
          <span>{{ firstLabel() }}</span>
          <span>{{ lastLabel() }}</span>
        </div>
      }
    </div>
  `,
})
export class DashboardActivityComponent {
  readonly activity = input.required<readonly DayActivity[]>();
  readonly selectedDay = input.required<Day | null>();
  readonly total = input.required<number>();
  readonly peak = input.required<number>();
  /** Langue d'affichage des dates (`fr`, `en`). */
  readonly locale = input.required<string>();

  readonly select = output<Day>();

  protected readonly firstLabel = computed(() => this.label(this.activity().at(0)?.day));
  protected readonly lastLabel = computed(() => this.label(this.activity().at(-1)?.day));

  protected barHeight(count: number): number {
    return activityBarHeightPx(count, this.peak());
  }

  protected barColor(item: DayActivity): string {
    if (item.day === this.selectedDay()) return 'var(--text-indigo)';
    return item.playerCount === 0 ? 'var(--bg-inactive)' : 'var(--bg-primary-dk)';
  }

  private label(day: Day | undefined): string {
    return day ? formatDayShort(day, this.locale()) : '';
  }
}
