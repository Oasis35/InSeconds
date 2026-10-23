import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';
import { formatMonth, monthGrid } from '../../domain/archive';

export interface ArchiveCalendarData {
  /** Les jours publiés (`aaaa-mm-jj`), dans n'importe quel ordre. */
  readonly dates: readonly string[];
  /** Le jour affiché par la page. */
  readonly current: string;
  readonly lang: 'fr' | 'en';
}

/** Le jour choisi (`aaaa-mm-jj`), ou rien (fermé). */
export type ArchiveCalendarResult = string | undefined;

const WEEKDAYS: Record<'fr' | 'en', readonly string[]> = {
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/**
 * Panneau bas « Choisir un défi » : un mois à la fois, du premier mois publié à celui de la veille. Seuls les jours publiés se touchent ; le jour
 * affiché est en orange.
 */
@Component({
  selector: 'app-archive-calendar-sheet',
  imports: [TranslatePipe, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'daily.archive.calendarTitle' | translate">
      <div class="flex flex-col gap-3" data-testid="archive-calendar">
        <div class="flex items-center justify-between">
          <button type="button" class="month-nav" [disabled]="month() <= first" (click)="month.set(month() - 1)"
                  [attr.aria-label]="'daily.archive.previousMonth' | translate">‹</button>
          <span class="text-sm font-semibold capitalize" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="calendar-month">{{ monthLabel() }}</span>
          <button type="button" class="month-nav" [disabled]="month() >= last" (click)="month.set(month() + 1)"
                  [attr.aria-label]="'daily.archive.nextMonth' | translate">›</button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-center text-[11px]" style="color:var(--text-faint)" aria-hidden="true">
          @for (d of weekdays; track $index) { <span>{{ d }}</span> }
        </div>
        @for (week of weeks(); track $index) {
          <div class="grid grid-cols-7 gap-1">
            @for (cell of week; track $index) {
              @if (cell === null) {
                <span></span>
              } @else if (cell.published) {
                <button type="button" class="day" [class.day--current]="cell.date === data.current" (click)="ref.close(cell.date)"
                        [attr.aria-current]="cell.date === data.current ? 'date' : null" [attr.data-date]="cell.date">{{ cell.day }}</button>
              } @else {
                <span class="day day--off">{{ cell.day }}</span>
              }
            }
          </div>
        }
        <p class="text-xs text-center pt-1" style="color:var(--text-faint)">{{ 'daily.archive.calendarNote' | translate }}</p>
      </div>
    </app-modal-frame>
  `,
  styles: `
    .month-nav {
      width: 36px; height: 36px; border-radius: var(--radius-button); border: 1px solid var(--border-neutral);
      color: var(--text-hi); font-size: 20px; line-height: 1;
    }
    .month-nav:disabled { opacity: 0.3; }
    .day {
      height: 38px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-button);
      font-size: 14px; font-weight: 600; color: var(--text-hi); background: rgb(255 255 255 / 0.06);
    }
    button.day:hover { background: rgb(255 255 255 / 0.12); }
    .day--current, button.day--current:hover { background: var(--gradient-primary); color: var(--text-on-primary); }
    .day--off { background: none; color: var(--text-faint); opacity: 0.45; font-weight: 400; }
  `,
})
export class ArchiveCalendarSheetComponent {
  protected readonly data = inject<ArchiveCalendarData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<ArchiveCalendarResult>>(DialogRef);

  protected readonly weekdays = WEEKDAYS[this.data.lang];
  private readonly published = new Set(this.data.dates);
  protected readonly first = Math.min(...this.data.dates.map(monthIndex), monthIndex(this.data.current));
  protected readonly last = Math.max(...this.data.dates.map(monthIndex), monthIndex(this.data.current));
  protected readonly month = signal(monthIndex(this.data.current));

  protected readonly weeks = computed(() => monthGrid(Math.floor(this.month() / 12), (this.month() % 12) + 1, this.published));
  protected readonly monthLabel = computed(() => formatMonth(Math.floor(this.month() / 12), (this.month() % 12) + 1, this.data.lang));
}
