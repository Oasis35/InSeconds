import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DayKpis } from '../../../domain/dashboard';

/**
 * Les chiffres du jour, dans la carte du jour de l'accueil : trois tuiles (ont fini, nouveaux joueurs, score médian, en violet : les
 * autres joueurs), puis une ligne secondaire (en cours ou inachevées, abandons, part qui finit, comptes créés). Sans défi ce jour-là :
 * le message à la place.
 */
@Component({
  selector: 'app-dashboard-kpis',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kpis(); as kpis) {
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-lg py-2 px-1" style="background:var(--bg-inactive)" data-testid="kpi-completed">
          <p class="text-2xl font-bold leading-tight tabular-nums" style="color:var(--text-hi)">{{ kpis.completedCount }}</p>
          <p class="text-[11px]" style="color:var(--text-muted)">{{ 'admin.dashboard.kpiCompleted' | translate }}</p>
        </div>
        <div class="rounded-lg py-2 px-1" style="background:var(--bg-inactive)" data-testid="kpi-new">
          <p class="text-2xl font-bold leading-tight tabular-nums" style="color:var(--text-hi)">{{ kpis.newPlayersCount }}</p>
          <p class="text-[11px]" style="color:var(--text-muted)" [title]="'admin.dashboard.kpiNewHint' | translate">{{ 'admin.dashboard.kpiNew' | translate }}</p>
        </div>
        <div class="rounded-lg py-2 px-1" style="background:var(--bg-inactive)" data-testid="kpi-median">
          <p class="text-2xl font-bold leading-tight tabular-nums" style="color:var(--color-violet)">
            {{ kpis.medianScore !== null ? (kpis.medianScore | number: '1.0-0') : '-' }}
          </p>
          <p class="text-[11px]" style="color:var(--text-muted)">{{ 'admin.dashboard.kpiMedian' | translate }}</p>
        </div>
      </div>
      <p class="text-xs text-center" style="color:var(--text-muted)" data-testid="kpi-details">
        @if (kpis.pendingCount > 0) { {{ 'admin.dashboard.pending' | translate: { count: kpis.pendingCount } }} · }
        @if (kpis.expiredCount > 0) { {{ 'admin.dashboard.expired' | translate: { count: kpis.expiredCount } }} · }
        {{ kpis.abandonedCount }} {{ (kpis.abandonedCount > 1 ? 'admin.dashboard.abandons' : 'admin.dashboard.abandon') | translate }} ·
        {{ 'admin.dashboard.completionRate' | translate: { rate: (kpis.completionRate | number: '1.0-0') } }} ·
        {{ (kpis.accountsCreatedCount > 1 ? 'admin.dashboard.accountsCreated' : 'admin.dashboard.accountCreated') | translate: { count: kpis.accountsCreatedCount } }}
      </p>
    } @else {
      <p class="text-sm text-center" style="color:var(--text-muted)">{{ 'admin.dashboard.noChallengeForDay' | translate }}</p>
    }
  `,
})
export class DashboardKpisComponent {
  readonly kpis = input.required<DayKpis | null>();
}
