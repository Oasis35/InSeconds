import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DayKpis, sourceLabelKey } from '../../../domain/dashboard';

/**
 * Les chiffres du jour, dans la carte du jour de l'accueil : trois tuiles (ont fini, nouveaux joueurs, score médian, en violet : les
 * autres joueurs), puis un volet « Détail », replié par défaut : en cours ou inachevées, abandons, part qui finit, comptes créés ; les
 * joueurs arrivés ce jour-là par source ; parmi ceux qui ont fini, les habitués et les nouveaux (côte à côte sur PC). Sans défi ce
 * jour-là : le message à la place.
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
      <!-- Le détail, replié par défaut : en cours, abandons, part qui finit, comptes ; les arrivés ; habitués et nouveaux. -->
      <button type="button" (click)="detailsOpen.set(!detailsOpen())" [attr.aria-expanded]="detailsOpen()" aria-controls="kpi-more"
        class="self-center text-xs hover:text-(--text-hi)" style="color:var(--text-muted)" data-testid="kpi-toggle">
        {{ 'admin.dashboard.details' | translate }} <span aria-hidden="true">{{ detailsOpen() ? '▴' : '▾' }}</span>
      </button>
      @if (detailsOpen()) {
        <div id="kpi-more" class="-mt-2 grid grid-cols-1 lg:grid-cols-[auto_auto] justify-center gap-x-6 gap-y-0.5 text-xs text-center"
          style="color:var(--text-muted)">
          <p class="lg:col-span-2" data-testid="kpi-details">
            @if (kpis.pendingCount > 0) { <span class="kpi-number">{{ kpis.pendingCount }}</span> {{ 'admin.dashboard.pending' | translate }} · }
            @if (kpis.expiredCount > 0) { <span class="kpi-number">{{ kpis.expiredCount }}</span> {{ 'admin.dashboard.expired' | translate }} · }
            <span class="kpi-number">{{ kpis.abandonedCount }}</span> {{ (kpis.abandonedCount > 1 ? 'admin.dashboard.abandons' : 'admin.dashboard.abandon') | translate }} ·
            <span class="kpi-number">{{ 'admin.dashboard.rate' | translate: { rate: (kpis.completionRate | number: '1.0-0') } }}</span> {{ 'admin.dashboard.completionRate' | translate }} ·
            <span class="kpi-number">{{ kpis.accountsCreatedCount }}</span> {{ (kpis.accountsCreatedCount > 1 ? 'admin.dashboard.accountsCreated' : 'admin.dashboard.accountCreated') | translate }}
          </p>
          @if (kpis.arrivals.length > 0) {
            <p data-testid="kpi-arrivals">
              {{ 'admin.dashboard.arrived' | translate }}
              @for (a of kpis.arrivals; track a.source; let last = $last) {
                <span class="kpi-number">{{ a.count }}</span>
                {{ sourceKey(a.source) ? (sourceKey(a.source)! | translate) : a.source }}@if (!last) { · }
              }
            </p>
          }
          @if (kpis.completedCount > 0) {
            <p data-testid="kpi-loyalty">
              {{ 'admin.dashboard.amongFinishers' | translate }}
              <span class="kpi-number">{{ kpis.completedCount - kpis.firstTimeFinishersCount }}</span>
              {{ 'admin.dashboard.regulars' | translate }} ·
              <span class="kpi-number">{{ kpis.firstTimeFinishersCount }}</span>
              {{ (kpis.firstTimeFinishersCount > 1 ? 'admin.dashboard.newcomers' : 'admin.dashboard.newcomer') | translate }}
            </p>
          }
        </div>
      }
    } @else {
      <p class="text-sm text-center" style="color:var(--text-muted)">{{ 'admin.dashboard.noChallengeForDay' | translate }}</p>
    }
  `,
  styles: `
    .kpi-number { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text-hi); }
  `,
})
export class DashboardKpisComponent {
  readonly kpis = input.required<DayKpis | null>();
  /** Le détail sous les tuiles est déplié (replié par défaut). */
  protected readonly detailsOpen = signal(false);

  protected readonly sourceKey = sourceLabelKey;
}
