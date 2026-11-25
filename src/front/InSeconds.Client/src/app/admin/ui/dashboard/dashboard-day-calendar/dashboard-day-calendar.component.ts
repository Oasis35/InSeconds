import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatMonth, monthOf } from '../../../domain/challenge';
import { calendarCells, shiftCalendarMonth } from '../../../domain/dashboard';

const WEEKDAYS_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAYS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Le calendrier d'un mois, sous la date de la carte du jour de l'accueil : ‹ › changent de mois, un jour qui a un défi se choisit,
 * les autres sont grisés. Il s'ouvre sur le mois du jour affiché. Purement présentationnel.
 */
@Component({
  selector: 'app-dashboard-day-calendar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-3 flex flex-col gap-2" style="background:var(--bg-inactive);border:1px solid var(--border-medium)" data-testid="day-calendar">
      <div class="flex items-center justify-between gap-2">
        <button type="button" (click)="month.set(shift(-1))" [disabled]="!hasEarlier()" [attr.aria-label]="'admin.challenges.previousMonth' | translate"
          class="w-9 h-9 flex items-center justify-center rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          style="background:var(--bg-surface);color:var(--text-hi)" data-testid="calendar-previous">‹</button>
        <span class="text-sm font-semibold first-letter:uppercase" style="color:var(--text-hi)" data-testid="calendar-month">{{ label() }}</span>
        <button type="button" (click)="month.set(shift(1))" [disabled]="!hasLater()" [attr.aria-label]="'admin.challenges.nextMonth' | translate"
          class="w-9 h-9 flex items-center justify-center rounded-lg text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          style="background:var(--bg-surface);color:var(--text-hi)" data-testid="calendar-next">›</button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs">
        @for (d of weekdays(); track $index) {
          <span class="text-[10px]" style="color:var(--text-muted)" aria-hidden="true">{{ d }}</span>
        }
        @for (cell of cells(); track $index) {
          @if (cell.day === null) {
            <span></span>
          } @else if (cell.hasChallenge) {
            <button type="button" (click)="daySelected.emit(cell.day)" [attr.aria-pressed]="cell.day === selectedDay()"
              class="py-2 rounded-lg tabular-nums" data-testid="calendar-day"
              [style.background]="cell.day === selectedDay() ? 'var(--bg-primary)' : 'var(--bg-surface)'"
              [style.color]="cell.day === selectedDay() ? 'var(--bg-page)' : 'var(--text-hi)'">{{ cell.dayOfMonth }}</button>
          } @else {
            <span class="py-2 tabular-nums" style="color:var(--text-faint);opacity:0.5" data-testid="calendar-day-empty">{{ cell.dayOfMonth }}</span>
          }
        }
      </div>
    </div>
  `,
})
export class DashboardDayCalendarComponent {
  /** Le jour affiché (`aaaa-mm-jj`) : mis en avant, et mois d'ouverture. */
  readonly selectedDay = input.required<string | null>();
  /** Les jours qui ont un défi, du plus récent au plus ancien. */
  readonly availableDays = input.required<readonly string[]>();
  readonly locale = input.required<string>();

  readonly daySelected = output<string>();

  /** Le mois affiché : celui du jour choisi, tant qu'on n'a pas tourné la page. */
  protected readonly month = linkedSignal(() => {
    const day = this.selectedDay() ?? this.availableDays()[0];
    return day ? monthOf(day) : new Date().toISOString().slice(0, 7);
  });
  protected readonly label = computed(() => formatMonth(this.month(), this.locale()));
  protected readonly cells = computed(() => calendarCells(this.month(), this.availableDays()));
  protected readonly weekdays = computed(() => (this.locale().startsWith('fr') ? WEEKDAYS_FR : WEEKDAYS_EN));
  /** Les bornes de ‹ › : un mois plus ancien (ou plus récent) qui a un défi. */
  protected readonly hasEarlier = computed(() => this.availableDays().some(d => monthOf(d) < this.month()));
  protected readonly hasLater = computed(() => this.availableDays().some(d => monthOf(d) > this.month()));

  protected shift(delta: 1 | -1): string {
    return shiftCalendarMonth(this.month(), delta);
  }
}
