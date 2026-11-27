import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { WeekReview, barRatio } from '../../domain/week-review';
import { pluralKey } from '../../domain/streak';

/**
 * Le bilan de la semaine passée du joueur, sept barres (lundi au dimanche) et ses chiffres :
 * - `compact` (accueil du lundi) : « La semaine dernière », la moyenne en grand, « 4 jours sur 7 · mardi : 3 120 », un lien « Voir le détail »
 *   vers l'historique et une croix pour la fermer ;
 * - `full` (historique) : « Ta semaine » avec ses dates, jours joués, moyenne, meilleur jour, et le meilleur morceau (celui qui a rapporté le
 *   plus de points).
 * Orange = le joueur : le meilleur jour est plein, les autres plus sombres, un jour sans partie un simple trait.
 */
@Component({
  selector: 'app-week-review-card',
  imports: [NgTemplateOutlet, RouterLink, TranslatePipe, PointsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="flex flex-col gap-3 p-4" [attr.data-testid]="compact() ? 'week-review-compact' : 'week-review-card'"
      style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-base font-semibold" style="font-family:var(--font-display);color:var(--text-hi)">
            {{ (compact() ? 'daily.weekReview.title' : 'daily.weekReview.cardTitle') | translate }}
          </h2>
          @if (!compact()) {
            <p class="text-[13px]" style="color:var(--text-muted)" data-testid="week-review-range">{{ 'daily.weekReview.range' | translate: { from: rangeFrom(), to: rangeTo() } }}</p>
          }
        </div>
        @if (compact()) {
          <button type="button" (click)="closed.emit()" class="-mt-2 -mr-2 w-11 h-11 flex items-center justify-center touch-manipulation cursor-pointer"
            style="color:var(--text-muted)" [attr.aria-label]="'daily.weekReview.close' | translate" data-testid="week-review-close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        }
      </div>

      @if (compact()) {
        <div class="flex items-end justify-between gap-4">
          <ng-container [ngTemplateOutlet]="barsTpl" />
          <p class="flex flex-col items-end shrink-0">
            <span class="text-[32px] font-extrabold leading-none tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)" data-testid="week-review-average">{{ review().averageScore | appPoints }}</span>
            <span class="text-[13px]" style="color:var(--text-muted)">{{ 'daily.weekReview.average' | translate }}</span>
          </p>
        </div>
        <div class="flex items-center justify-between gap-3 pt-3 text-sm" style="border-top:1px solid var(--border-medium)">
          <p class="min-w-0" style="color:var(--text-muted)">
            <b style="color:var(--text-hi)" data-testid="week-review-days">{{ ('daily.weekReview.daysOfSeven.' + plural()) | translate: { n: review().playedCount } }}</b>
            @if (bestDayName(); as name) {
              <span> · {{ name }} : <b class="tabular-nums" style="color:var(--color-accent-3)">{{ review().bestScore | appPoints }}</b></span>
            }
          </p>
          <a routerLink="/history/daily" class="shrink-0 min-h-11 inline-flex items-center underline underline-offset-4 touch-manipulation" style="color:var(--text-light)" data-testid="week-review-link">{{ 'daily.weekReview.seeDetail' | translate }} <span aria-hidden="true">&nbsp;›</span></a>
        </div>
      } @else {
        <div class="grid grid-cols-3 gap-2">
          <p class="flex flex-col gap-0.5">
            <b class="text-[26px] leading-none tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)">{{ review().playedCount }}<span class="font-normal" style="color:var(--text-muted)"> / 7</span></b>
            <span class="text-[13px]" style="color:var(--text-muted)">{{ 'daily.weekReview.daysPlayed' | translate }}</span>
          </p>
          <p class="flex flex-col gap-0.5">
            <b class="text-[26px] leading-none tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)" data-testid="week-review-average">{{ review().averageScore | appPoints }}</b>
            <span class="text-[13px]" style="color:var(--text-muted)">{{ 'daily.weekReview.averageShort' | translate }}</span>
          </p>
          <p class="flex flex-col gap-0.5">
            <b class="text-[26px] leading-none tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)">{{ review().bestScore | appPoints }}</b>
            <span class="text-[13px]" style="color:var(--text-muted)">{{ 'daily.weekReview.bestDayLabel' | translate: { day: bestDayName() } }}</span>
          </p>
        </div>
        <ng-container [ngTemplateOutlet]="barsTpl" />
        @if (review().bestTrack; as track) {
          <p class="pt-3 text-sm" style="border-top:1px solid var(--border-medium);color:var(--text-muted)" data-testid="week-review-best-track">
            {{ 'daily.weekReview.bestTrack' | translate }} <b style="color:var(--text-hi)">{{ track.title }}</b>,
            <b class="tabular-nums" style="color:var(--color-accent-3)">{{ 'daily.weekReview.points' | translate: { points: (track.score | appPoints) } }}</b>
          </p>
        }
      }
    </section>

    <ng-template #barsTpl>
      <ol class="flex items-end gap-1.5 list-none p-0 m-0" [class.flex-1]="!compact()" [class.justify-between]="!compact()" data-testid="week-review-bars">
        @for (bar of bars(); track bar.date) {
          <li class="flex flex-col items-center gap-1.5" [class.flex-1]="!compact()" role="img" [attr.aria-label]="bar.label">
            <span class="rounded-[5px] flex items-end" [class.w-[18px]]="compact()" [class.w-[22px]]="!compact()" [style.height.px]="compact() ? 36 : 56">
              @if (bar.ratio > 0) {
                <span class="w-full rounded-[5px]" data-testid="week-review-bar" [style.height.%]="bar.ratio * 100"
                  [style.background]="bar.best ? 'var(--color-accent-3)' : 'rgb(var(--rgb-accent-3) / 0.45)'"></span>
              } @else {
                <span class="w-full h-[3px] rounded-full" data-testid="week-review-bar-empty" style="background:var(--border-medium)"></span>
              }
            </span>
            <span class="text-[11px]" style="color:var(--text-muted)" aria-hidden="true">{{ bar.initial }}</span>
          </li>
        }
      </ol>
    </ng-template>
  `,
})
export class WeekReviewCardComponent {
  private readonly translate = inject(TranslateService);

  readonly review = input.required<WeekReview>();
  readonly lang = input<'fr' | 'en'>('fr');
  /** `true` : la carte compacte de l'accueil (avec croix et lien) ; sinon la carte complète de l'historique. */
  readonly compact = input(false);
  readonly closed = output<void>();

  protected readonly plural = computed(() => pluralKey(this.review().playedCount));

  private format(day: string, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.lang() === 'fr' ? 'fr-FR' : 'en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
  }

  protected readonly rangeFrom = computed(() => this.format(this.review().weekStart, { day: 'numeric' }));
  protected readonly rangeTo = computed(() => {
    const days = this.review().days;
    return days.length ? this.format(days[days.length - 1].date, { day: 'numeric', month: 'long' }) : '';
  });
  protected readonly bestDayName = computed(() => {
    const day = this.review().bestDay;
    return day ? this.format(day, { weekday: 'long' }) : null;
  });

  protected readonly bars = computed(() => {
    const { days, maxPossibleScore, bestDay } = this.review();
    return days.map(d => {
      const day = this.format(d.date, { weekday: 'long' });
      return {
        date: d.date,
        ratio: barRatio(d.score, maxPossibleScore),
        best: d.date === bestDay,
        initial: this.format(d.date, { weekday: 'narrow' }).toUpperCase(),
        label: d.score === null
          ? this.translate.instant('daily.weekReview.dayBarNone', { day })
          : this.translate.instant('daily.weekReview.dayBarLabel', { day, score: d.score }),
      };
    });
  });
}
