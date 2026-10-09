import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerBreakdown } from '../domain/dashboard';

/** Répartition des joueurs : invités, inscrits, actifs sur 7 et 30 jours. */
@Component({
  selector: 'app-dashboard-players',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-5 flex flex-col gap-3" style="background:var(--bg-surface)">
      <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.playersTitle' | translate }}</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-lg p-3 flex flex-col gap-1" style="background:var(--bg-inactive)">
          <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.dashboard.guests' | translate }}</span>
          <span class="text-xl font-bold" style="color:var(--text-hi)">{{ players().totalGuests }}</span>
        </div>
        <div class="rounded-lg p-3 flex flex-col gap-1" style="background:var(--bg-inactive)">
          <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.dashboard.registered' | translate }}</span>
          <span class="text-xl font-bold" style="color:var(--text-hi)">{{ players().totalRegistered }}</span>
        </div>
        <div class="rounded-lg p-3 flex flex-col gap-1" style="background:var(--bg-inactive)">
          <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.dashboard.active7d' | translate }}</span>
          <span class="text-xl font-bold" style="color:var(--text-indigo)">{{ players().activeLast7Days }}</span>
        </div>
        <div class="rounded-lg p-3 flex flex-col gap-1" style="background:var(--bg-inactive)">
          <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.dashboard.active30d' | translate }}</span>
          <span class="text-xl font-bold" style="color:var(--text-indigo)">{{ players().activeLast30Days }}</span>
        </div>
      </div>
    </div>
  `,
})
export class DashboardPlayersComponent {
  readonly players = input.required<PlayerBreakdown>();
}
