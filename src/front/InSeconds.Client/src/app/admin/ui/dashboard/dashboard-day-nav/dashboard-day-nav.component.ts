import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatDayLong } from '../../../domain/dashboard';

/** Sélecteur de jour de l'accueil, en tête de la carte du jour : jour précédent / suivant autour du jour affiché. */
@Component({
  selector: 'app-dashboard-day-nav',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between gap-2">
      <button type="button" (click)="previous.emit()" [disabled]="!canGoToPrevious()" [attr.aria-label]="'admin.dashboard.previousDay' | translate"
        class="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">
        ‹
      </button>
      <div class="flex flex-col items-center gap-0.5 flex-1 min-w-0 text-center" data-testid="dashboard-selected-day">
        <span class="font-semibold text-sm truncate max-w-full first-letter:uppercase" style="color:var(--text-hi)">{{ label() }}</span>
        @if (isToday()) {
          <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.dashboard.todayLive' | translate }}</span>
        } @else {
          <span class="text-xs" style="color:var(--text-muted)">{{ day() }}</span>
        }
      </div>
      <button type="button" (click)="next.emit()" [disabled]="!canGoToNext()" [attr.aria-label]="'admin.dashboard.nextDay' | translate"
        class="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">
        ›
      </button>
    </div>
  `,
})
export class DashboardDayNavComponent {
  readonly day = input.required<string | null>();
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
