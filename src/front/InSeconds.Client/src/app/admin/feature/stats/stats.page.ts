import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { StatsStore } from '../../data-access/stats.store';
import { STATS_PERIODS } from '../../domain/stats';
import { DashboardArrivalsComponent } from '../../ui/dashboard/dashboard-arrivals/dashboard-arrivals.component';
import { StatsAnswersComponent } from '../../ui/stats/stats-answers/stats-answers.component';
import { StatsCohortTableComponent } from '../../ui/stats/stats-cohort-table/stats-cohort-table.component';
import { BarLegend, DayBar, StatsDayBarsComponent } from '../../ui/stats/stats-day-bars/stats-day-bars.component';

const SOURCE_KEYS = ['instagram', 'tiktok', 'share', 'direct', 'other'];
const DEVICE_KEYS = ['phone', 'tablet', 'desktop', 'unknown'];

/**
 * `/admin/stats` (onglet « Stats ») : ce qu'on regarde sur la durée, l'accueil restant centré sur le jour. Une période (7, 30 ou 90 jours) :
 * d'où viennent les nouveaux, s'ils reviennent (J+1, J+7) selon la source et l'appareil, habitués et nouveaux par jour, les parties par
 * issue, les réponses et les paliers d'écoute. L'appareil est déduit de l'en-tête du navigateur à l'arrivée, jamais demandé au joueur.
 * Écran réservé à l'admin : ses couleurs (vert, jaune, rouge) sont hors de la direction artistique du jeu, pour la lisibilité.
 */
@Component({
  selector: 'app-admin-stats-page',
  imports: [TranslatePipe, ErrorMessageComponent, DashboardArrivalsComponent, StatsCohortTableComponent, StatsDayBarsComponent, StatsAnswersComponent],
  providers: [StatsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="w-full max-w-2xl lg:max-w-none grid gap-4 lg:grid-cols-2 lg:items-start" data-testid="admin-stats-page">
      <div class="lg:col-span-2 flex gap-2" role="group" [attr.aria-label]="'admin.stats.period' | translate">
        @for (days of periods; track days) {
          <button type="button" class="px-3 py-2 rounded-(--radius-button) text-sm border" [attr.data-testid]="'period-' + days"
            [attr.aria-pressed]="store.period() === days" (click)="store.selectPeriod(days)"
            [style.border-color]="store.period() === days ? 'var(--color-accent-3)' : 'var(--border-neutral)'"
            [style.color]="store.period() === days ? 'var(--color-accent-3)' : 'var(--text-light)'">
            {{ 'admin.stats.periodDays' | translate: { days } }}
          </button>
        }
      </div>

      @if (store.error(); as error) {
        <app-error-message class="lg:col-span-2" [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      @if (store.stats(); as stats) {
        <div class="flex flex-col gap-4">
          <app-dashboard-arrivals [arrivals]="arrivals()" [days]="stats.days" />

          <div class="rounded-(--radius-card) p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="stats-sources">
            <h2 class="text-sm font-semibold">{{ 'admin.stats.returnBySource' | translate }}</h2>
            <app-stats-cohort-table [rows]="stats.sources" labelPrefix="admin.sources" [knownKeys]="sourceKeys" />
            <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.stats.returnNote' | translate }}</p>
          </div>

          <div class="rounded-(--radius-card) p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="stats-devices">
            <h2 class="text-sm font-semibold">{{ 'admin.stats.returnByDevice' | translate }}</h2>
            <app-stats-cohort-table [rows]="stats.devices" labelPrefix="admin.stats.devices" [knownKeys]="deviceKeys" />
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <div class="rounded-(--radius-card) p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="stats-regulars">
            <h2 class="text-sm font-semibold">{{ 'admin.stats.regularsTitle' | translate }}</h2>
            <app-stats-day-bars [bars]="regularBars()" [legend]="regularLegend" ariaLabel="admin.stats.regularsTitle" />
          </div>

          <div class="rounded-(--radius-card) p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="stats-games">
            <div class="flex items-baseline justify-between gap-2">
              <h2 class="text-sm font-semibold">{{ 'admin.stats.gamesTitle' | translate }}</h2>
              @if (stats.medianScore !== null) {
                <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.stats.median' | translate }}
                  <span class="font-semibold tabular-nums" style="color:var(--color-violet)">{{ stats.medianScore }}</span></span>
              }
            </div>
            <app-stats-day-bars [bars]="gameBars()" [legend]="gameLegend" ariaLabel="admin.stats.gamesTitle" />
          </div>

          <div class="rounded-(--radius-card) p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="stats-answers-card">
            <h2 class="text-sm font-semibold">{{ 'admin.stats.answersTitle' | translate }}</h2>
            <app-stats-answers [answers]="stats.answers" />
          </div>
        </div>
      }
    </section>
  `,
})
export class StatsPage {
  protected readonly store = inject(StatsStore);
  protected readonly errorMessageKey = errorMessageKey;
  protected readonly periods = STATS_PERIODS;
  protected readonly sourceKeys = SOURCE_KEYS;
  protected readonly deviceKeys = DEVICE_KEYS;

  protected readonly regularLegend: readonly BarLegend[] = [
    { labelKey: 'admin.stats.regulars', color: 'var(--color-violet)' },
    { labelKey: 'admin.stats.newcomers', color: 'var(--color-accent-2)' },
  ];
  protected readonly gameLegend: readonly BarLegend[] = [
    { labelKey: 'admin.stats.completed', color: 'var(--color-success)' },
    { labelKey: 'admin.stats.abandoned', color: 'var(--color-warn)' },
    { labelKey: 'admin.stats.expired', color: 'var(--color-fail)' },
  ];

  protected readonly arrivals = computed(() =>
    (this.store.stats()?.sources ?? []).filter(s => s.newPlayers > 0).map(s => ({ source: s.key, count: s.newPlayers })));
  protected readonly regularBars = computed<DayBar[]>(() =>
    (this.store.stats()?.daily ?? []).map(d => ({ day: d.day, parts: [d.players - d.firstTimePlayers, d.firstTimePlayers] })));
  protected readonly gameBars = computed<DayBar[]>(() =>
    (this.store.stats()?.daily ?? []).map(d => ({ day: d.day, parts: [d.completed, d.abandoned, d.expired] })));

  constructor() {
    void this.store.load(this.store.period());
  }
}
