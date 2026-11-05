import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ArrivalCount, DashboardShares, sharedArrivals } from '../../../domain/dashboard';

interface ShareRow {
  readonly id: string;
  readonly labelKey: string;
  readonly day: number;
  readonly last30Days: number;
}

/**
 * « Partages du score », sous la carte du jour de l'accueil : les partages faits, puis les amis venus par leur lien (source d'arrivée `share`),
 * le jour affiché et sur 30 jours. Des totaux, jamais un joueur. L'API compte encore les partages par format : le format `short` n'existe plus
 * côté jeu, les deux sont additionnés.
 */
@Component({
  selector: 'app-dashboard-shares',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="dashboard-shares">
      <span class="text-xs font-semibold" style="color:var(--text-muted)">{{ 'admin.dashboard.shares.title' | translate }}</span>
      <div class="grid grid-cols-[1fr_auto_auto] gap-x-5 gap-y-1.5 text-xs items-baseline">
        <span></span>
        <span class="text-right" style="color:var(--text-muted)">{{ 'admin.dashboard.shares.day' | translate }}</span>
        <span class="text-right" style="color:var(--text-muted)">{{ 'admin.dashboard.shares.last30Days' | translate }}</span>
        @for (row of rows(); track row.id) {
          <span style="color:var(--text-muted)">{{ row.labelKey | translate }}</span>
          <span class="text-right font-semibold tabular-nums" style="color:var(--text-hi)" [attr.data-testid]="'shares-' + row.id + '-day'">{{ row.day }}</span>
          <span class="text-right font-semibold tabular-nums" style="color:var(--text-hi)" [attr.data-testid]="'shares-' + row.id + '-30'">{{ row.last30Days }}</span>
        }
      </div>
      <p class="text-[11px]" style="color:var(--text-muted)">{{ 'admin.dashboard.shares.note' | translate }}</p>
    </div>
  `,
})
export class DashboardSharesComponent {
  readonly shares = input.required<DashboardShares>();
  /** Les arrivées du jour affiché (vides sans défi ce jour-là). */
  readonly dayArrivals = input.required<readonly ArrivalCount[]>();
  /** Les arrivées des 30 derniers jours. */
  readonly arrivals = input.required<readonly ArrivalCount[]>();

  protected readonly rows = computed<ShareRow[]>(() => {
    const { selectedDay, last30Days } = this.shares();
    const day = sharedArrivals(this.dayArrivals());
    const month = sharedArrivals(this.arrivals());
    return [
      { id: 'count', labelKey: 'admin.dashboard.shares.count', day: selectedDay.short + selectedDay.long, last30Days: last30Days.short + last30Days.long },
      { id: 'friends', labelKey: 'admin.dashboard.shares.friends', day, last30Days: month },
    ];
  });
}
