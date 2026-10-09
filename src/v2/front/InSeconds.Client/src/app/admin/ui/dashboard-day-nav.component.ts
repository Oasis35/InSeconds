import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Day, formatDayLong } from '../domain/dashboard';

/** Sélecteur de jour du tableau de bord : jour précédent / suivant autour du jour affiché. */
@Component({
  selector: 'app-dashboard-day-nav',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-4 flex items-center justify-between gap-3" style="background:var(--bg-surface)">
      <button type="button" (click)="previous.emit()" [disabled]="!canGoToPrevious()"
        class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">
        ‹
      </button>
      <div class="flex flex-col items-center gap-1 flex-1" data-testid="dashboard-selected-day">
        <span class="font-semibold text-sm" style="color:var(--text-hi)">{{ label() }}</span>
        @if (isToday()) {
          <span class="text-xs font-medium" style="color:var(--text-indigo)">{{ 'admin.dashboard.today' | translate }}</span>
        } @else {
          <span class="text-xs" style="color:var(--text-muted)">{{ day() }}</span>
        }
      </div>
      <button type="button" (click)="next.emit()" [disabled]="!canGoToNext()"
        class="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">
        ›
      </button>
    </div>
  `,
})
export class DashboardDayNavComponent {
  readonly day = input.required<Day | null>();
  /** Langue d'affichage du jour (`fr`, `en`). */
  readonly locale = input.required<string>();
  readonly isToday = input(false);
  readonly canGoToPrevious = input(false);
  readonly canGoToNext = input(false);

  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly label = computed(() => {
    const day = this.day();
    return day ? formatDayLong(day, this.locale()) : '';
  });
}
