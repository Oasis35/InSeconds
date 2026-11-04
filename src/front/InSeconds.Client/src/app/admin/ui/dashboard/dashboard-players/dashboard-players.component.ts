import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerBreakdown } from '../../../domain/dashboard';

/** Les totaux des joueurs, en une ligne sous le graphique : joueurs (invités et comptes), comptes, actifs sur 7 et 30 jours. */
@Component({
  selector: 'app-dashboard-players',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="text-xs text-center px-2" style="color:var(--text-muted)" data-testid="dashboard-totals">
      <span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ total() }}</span> {{ 'admin.dashboard.totalPlayers' | translate }} ·
      <span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ players().totalRegistered }}</span> {{ 'admin.dashboard.registered' | translate }} ·
      <span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ players().activeLast7Days }}</span> {{ 'admin.dashboard.active7d' | translate }} ·
      <span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ players().activeLast30Days }}</span> {{ 'admin.dashboard.active30d' | translate }}
    </p>
  `,
})
export class DashboardPlayersComponent {
  readonly players = input.required<PlayerBreakdown>();

  protected readonly total = computed(() => this.players().totalGuests + this.players().totalRegistered);
}
