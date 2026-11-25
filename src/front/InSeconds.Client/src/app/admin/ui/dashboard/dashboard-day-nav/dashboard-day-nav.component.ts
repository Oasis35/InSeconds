import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatDayLong } from '../../../domain/dashboard';
import { DashboardDayCalendarComponent } from '../dashboard-day-calendar/dashboard-day-calendar.component';

/**
 * Sélecteur de jour de l'accueil, en tête de la carte du jour : jour précédent / suivant autour du jour affiché ; un clic sur la date
 * ouvre le calendrier du mois (n'importe quel jour qui a un défi), qui se referme au choix d'un jour.
 */
@Component({
  selector: 'app-dashboard-day-nav',
  imports: [TranslatePipe, DashboardDayCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <div class="flex items-center justify-between gap-2">
      <button type="button" (click)="previous.emit()" [disabled]="!canGoToPrevious()" [attr.aria-label]="'admin.dashboard.previousDay' | translate"
        class="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">
        ‹
      </button>
      <div class="flex flex-col items-center gap-0.5 flex-1 min-w-0 text-center" data-testid="dashboard-selected-day">
        <button type="button" (click)="calendarOpen.set(!calendarOpen())" [attr.aria-expanded]="calendarOpen()" data-testid="day-picker-toggle"
          class="font-semibold text-sm truncate max-w-full first-letter:uppercase py-1 -my-1 hover:text-(--text-hi)" style="color:var(--text-hi)">
          {{ label() }} <span aria-hidden="true">{{ calendarOpen() ? '▴' : '▾' }}</span>
        </button>
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
    @if (calendarOpen()) {
      <app-dashboard-day-calendar [selectedDay]="day()" [availableDays]="availableDays()" [locale]="locale()" (daySelected)="pick($event)" />
    }
  `,
})
export class DashboardDayNavComponent {
  readonly day = input.required<string | null>();
  /** Langue d'affichage du jour (`fr`, `en`). */
  readonly locale = input.required<string>();
  readonly isToday = input(false);
  readonly canGoToPrevious = input(false);
  readonly canGoToNext = input(false);

  /** Les jours qui ont un défi, pour le calendrier. */
  readonly availableDays = input<readonly string[]>([]);

  readonly daySelected = output<string>();
  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly calendarOpen = signal(false);

  protected pick(day: string): void {
    this.calendarOpen.set(false);
    this.daySelected.emit(day);
  }

  protected readonly label = computed(() => {
    const day = this.day();
    return day ? formatDayLong(day, this.locale()) : '';
  });
}
