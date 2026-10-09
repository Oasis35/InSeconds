import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { LanguageService } from '../../core/i18n/language.service';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { DashboardStore } from '../data-access/dashboard.store';
import { DashboardActivityComponent } from '../ui/dashboard-activity.component';
import { DashboardDayNavComponent } from '../ui/dashboard-day-nav.component';
import { DashboardKpisComponent } from '../ui/dashboard-kpis.component';
import { DashboardPlayersComponent } from '../ui/dashboard-players.component';

/**
 * `/admin/dashboard` : chiffres d'un jour (navigation jour par jour ou par clic sur le graphique),
 * activité des 30 derniers jours, répartition des joueurs. Se charge à l'ouverture de l'onglet.
 */
@Component({
  selector: 'app-admin-dashboard-page',
  imports: [
    TranslatePipe, ErrorMessageComponent, DashboardDayNavComponent, DashboardKpisComponent,
    DashboardActivityComponent, DashboardPlayersComponent,
  ],
  providers: [DashboardStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="flex flex-col gap-4 w-full max-w-2xl" data-testid="admin-dashboard-page">
      @if (store.error(); as error) {
        <app-error-message [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      @if (store.dashboard(); as dashboard) {
        <app-dashboard-day-nav
          [day]="store.selectedDay()"
          [locale]="locale()"
          [isToday]="store.isSelectedDayToday()"
          [canGoToPrevious]="store.canGoToPreviousDay()"
          [canGoToNext]="store.canGoToNextDay()"
          (previous)="store.shiftDay(-1)"
          (next)="store.shiftDay(1)" />
        <app-dashboard-kpis [kpis]="dashboard.kpis" />
        <app-dashboard-activity
          [activity]="dashboard.activity"
          [selectedDay]="store.selectedDay()"
          [total]="store.totalPlayers()"
          [peak]="store.maxDailyPlayers()"
          [locale]="locale()"
          (daySelected)="store.selectDay($event)" />
        <app-dashboard-players [players]="dashboard.players" />
      } @else if (store.isPending()) {
        <div class="rounded-xl p-5 flex items-center justify-center h-24" style="background:var(--bg-surface)">
          <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.loading' | translate }}</p>
        </div>
      }
    </section>
  `,
})
export class DashboardPage {
  protected readonly store = inject(DashboardStore);
  protected readonly errorMessageKey = errorMessageKey;
  private readonly language = inject(LanguageService);

  protected readonly locale = computed(() => this.language.current());

  constructor() {
    void this.store.load();
  }
}
