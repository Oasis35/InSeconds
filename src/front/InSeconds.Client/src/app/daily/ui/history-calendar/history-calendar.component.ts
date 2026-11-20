import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { formatScore, utcDayOf } from '../../../ui/format/day-label';
import { MonthNavComponent } from '../../../ui/history/month-nav.component';
import { CalendarCell, DailyHistory, calendarWeeks, dayLink } from '../../domain/history';

const WEEKDAYS: Record<'fr' | 'en', readonly string[]> = {
  fr: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

/**
 * Le calendrier d'un mois de l'historique du défi du jour : ‹ mois ›, une case par jour (lundi en premier), puis les chiffres du mois. Une case
 * jouée est teintée d'ambre selon son score (c'est le joueur), un jour manqué est en pointillé, un jour pas fini a un contour ambre en pointillé,
 * aujourd'hui est cerclé ; un jour sans défi est éteint et ne mène nulle part. Chaque case est un vrai lien : les réponses du jour, ou le défi.
 */
@Component({
  selector: 'app-history-calendar',
  imports: [RouterLink, TranslatePipe, MonthNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-3 px-2.5 pt-2 pb-4" style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)"
             data-testid="history-calendar">
      <app-month-nav [month]="history().month" [previous]="history().previousMonth" [next]="history().nextMonth" [lang]="lang()" />

      <div class="grid grid-cols-7 gap-1 text-center text-[11px]" style="color:var(--text-faint)" aria-hidden="true">
        @for (d of weekdays(); track $index) { <span>{{ d }}</span> }
      </div>
      <div class="grid grid-cols-7 gap-1">
        @for (cell of cells(); track $index) {
          @if (cell === null) {
            <span></span>
          } @else if (cell.link) {
            <a [routerLink]="cell.link" class="day" [attr.data-state]="cell.state" [attr.data-testid]="'history-day-' + cell.date"
               [style.background]="cell.background" [style.color]="cell.color"
               [attr.aria-label]="'daily.history.calendar.' + cell.state | translate: { day: cell.day, score: cell.scoreText }">{{ cell.day }}</a>
          } @else {
            <span class="day day--off" aria-hidden="true">{{ cell.day }}</span>
          }
        }
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]" style="color:var(--text-faint)">
        <span class="inline-flex items-center gap-1.5">
          {{ 'daily.history.calendar.legendLess' | translate }}
          <span class="swatch" style="background:rgb(var(--rgb-accent-3) / 0.22)"></span>
          <span class="swatch" style="background:rgb(var(--rgb-accent-3) / 0.55)"></span>
          <span class="swatch" style="background:rgb(var(--rgb-accent-3) / 0.92)"></span>
          {{ 'daily.history.calendar.legendMore' | translate }}
        </span>
        <span class="inline-flex items-center gap-1.5"><span class="swatch" style="border:1px dashed rgb(var(--rgb-accent-3) / 0.7)"></span>{{ 'daily.history.calendar.legendUnfinished' | translate }}</span>
        <span class="inline-flex items-center gap-1.5"><span class="swatch" style="border:1px dashed var(--border-neutral)"></span>{{ 'daily.history.calendar.legendMissed' | translate }}</span>
      </div>

      <dl class="grid grid-cols-3 gap-3 pt-3" style="border-top:1px solid var(--border-medium)" data-testid="history-month-stats">
        <div>
          <dt class="text-xs" style="color:var(--text-muted)">{{ 'daily.history.month.played' | translate }}</dt>
          <dd class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="history-month-played">
            {{ history().monthPlayedCount }}<span class="text-sm font-semibold" style="color:var(--text-faint)"> / {{ history().monthPublishedCount }}</span>
          </dd>
        </div>
        <div>
          <dt class="text-xs" style="color:var(--text-muted)">{{ 'daily.history.month.average' | translate }}</dt>
          <dd class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="history-month-average">{{ format(history().monthAverageScore) }}</dd>
        </div>
        <div>
          <dt class="text-xs" style="color:var(--text-muted)">{{ 'daily.history.month.best' | translate }}</dt>
          <dd class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)" data-testid="history-month-best">{{ format(history().monthBestScore) }}</dd>
        </div>
      </dl>
    </section>
  `,
  styles: `
    .day {
      height: 44px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-button);
      font-family: var(--font-score); font-size: 14px; font-weight: 700; touch-action: manipulation;
    }
    .day[data-state='missed'] { border: 1px dashed var(--border-neutral); }
    .day[data-state='unfinished'] { border: 1px dashed rgb(var(--rgb-accent-3) / 0.7); }
    .day[data-state='resumable'] { border: 1px solid rgb(var(--rgb-accent-3) / 0.7); }
    .day[data-state='today'] { border: 2px solid var(--color-accent-3); }
    .day--off { font-family: var(--font-body); font-size: 13px; font-weight: 400; color: var(--text-faint); opacity: 0.5; }
    .swatch { width: 12px; height: 12px; border-radius: 4px; display: inline-block; }
  `,
})
export class HistoryCalendarComponent {
  readonly history = input.required<DailyHistory>();
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly weekdays = computed(() => WEEKDAYS[this.lang()]);

  /** Le jour de jeu (UTC) : sa case mène au défi, même joué (ses réponses ne sont publiées que demain). */
  private readonly today = utcDayOf(new Date());

  protected readonly cells = computed(() =>
    calendarWeeks(this.history().month, this.history().days).flat().map(cell => (cell === null ? null : this.view(cell))));

  protected format(score: number | null): string {
    return formatScore(score, this.lang());
  }

  private view(cell: CalendarCell) {
    const played = cell.state === 'played';
    return {
      ...cell,
      link: dayLink(cell, this.today),
      scoreText: this.format(cell.score),
      background: played ? `rgb(var(--rgb-accent-3) / ${cell.tint})` : null,
      color: played && cell.tint > 0.6 ? 'var(--text-on-orange)' : cell.state === 'missed' || cell.state === 'unfinished' || cell.state === 'resumable' ? 'var(--text-muted)' : 'var(--text-hi)',
    };
  }
}
