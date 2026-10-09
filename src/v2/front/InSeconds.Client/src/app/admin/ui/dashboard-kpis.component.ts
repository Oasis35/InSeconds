import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DayKpis, completionRateColor } from '../domain/dashboard';

/** Les quatre chiffres du jour sélectionné, ou « aucun défi pour ce jour ». */
@Component({
  selector: 'app-dashboard-kpis',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (kpis(); as kpis) {
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-xl p-4 flex flex-col gap-1" style="background:var(--bg-surface)">
          <span class="text-xs uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.kpiCompleted' | translate }}</span>
          <span class="text-2xl font-bold" style="color:var(--text-hi)">{{ kpis.completedCount }}</span>
          <span class="text-xs" style="color:var(--text-faint)">{{ (kpis.completedCount > 1 ? 'admin.dashboard.players' : 'admin.dashboard.player') | translate }}</span>
        </div>
        <div class="rounded-xl p-4 flex flex-col gap-1" style="background:var(--bg-surface)">
          <span class="text-xs uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.kpiUnfinished' | translate }}</span>
          <span class="text-2xl font-bold" [style.color]="(kpis.abandonedCount + kpis.expiredCount) > 0 ? 'var(--bg-warn)' : 'var(--text-hi)'">{{ kpis.abandonedCount + kpis.expiredCount }}</span>
          <span class="text-xs" style="color:var(--text-faint)">{{ 'admin.dashboard.unfinishedBreakdown' | translate: { abandoned: kpis.abandonedCount, expired: kpis.expiredCount } }}</span>
        </div>
        <div class="rounded-xl p-4 flex flex-col gap-1" style="background:var(--bg-surface)">
          <span class="text-xs uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.kpiCompletion' | translate }}</span>
          @if (kpis.completedCount === 0) {
            <span class="text-2xl font-bold" style="color:var(--text-sep)">—</span>
            <span class="text-xs" style="color:var(--text-faint)">{{ kpis.totalSessions }} {{ (kpis.totalSessions > 1 ? 'admin.dashboard.sessions' : 'admin.dashboard.session') | translate }}, {{ 'admin.dashboard.noneComplete' | translate }}</span>
          } @else {
            <span class="text-2xl font-bold" [style.color]="rateColor(kpis.completionRate)">{{ kpis.completionRate | number:'1.0-1' }}%</span>
            <span class="text-xs" style="color:var(--text-faint)">{{ kpis.completedCount }}/{{ kpis.totalSessions }} {{ (kpis.totalSessions > 1 ? 'admin.dashboard.sessions' : 'admin.dashboard.session') | translate }}</span>
          }
        </div>
        <div class="rounded-xl p-4 flex flex-col gap-1" style="background:var(--bg-surface)">
          <span class="text-xs uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.kpiMedian' | translate }}</span>
          @if (kpis.medianScore !== null) {
            <span class="text-2xl font-bold" style="color:var(--text-indigo)">{{ kpis.medianScore | number:'1.0-0' }}</span>
          } @else {
            <span class="text-2xl font-bold" style="color:var(--text-sep)">—</span>
          }
          <span class="text-xs" style="color:var(--text-faint)">{{ 'admin.dashboard.points' | translate }}</span>
        </div>
      </div>
    } @else {
      <div class="rounded-xl p-4 text-center text-sm" style="background:var(--bg-surface);color:var(--text-muted)">
        {{ 'admin.dashboard.noChallengeForDay' | translate }}
      </div>
    }
  `,
})
export class DashboardKpisComponent {
  readonly kpis = input.required<DayKpis | null>();

  protected readonly rateColor = completionRateColor;
}
