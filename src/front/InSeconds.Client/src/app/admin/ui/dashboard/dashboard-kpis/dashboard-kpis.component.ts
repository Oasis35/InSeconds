import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { DayKpis, sourceLabelKey } from '../../../domain/dashboard';

/**
 * Les chiffres du jour, dans la carte du jour de l'accueil : trois tuiles (ont fini, nouveaux joueurs, score médian, en violet : les
 * autres joueurs), puis un volet « Détail », déplié d'office sur PC, replié sur téléphone (`openByDefault`) : en cours ou inachevées, abandons, part qui finit, comptes créés ; les
 * joueurs arrivés ce jour-là par source ; parmi ceux qui ont fini, les habitués et les nouveaux (côte à côte sur PC). Sans défi ce
 * jour-là : le message à la place.
 */
@Component({
  selector: 'app-dashboard-kpis',
  imports: [DatePipe, DecimalPipe, TranslatePipe, ButtonComponent],
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
      <!-- Le détail, déplié d'office sur PC : en cours, abandons, part qui finit, comptes ; les arrivés ; habitués et nouveaux. -->
      <button type="button" (click)="detailsOpen.set(!detailsOpen())" [attr.aria-expanded]="detailsOpen()" aria-controls="kpi-more"
        class="self-center py-2 -my-2 text-xs hover:text-(--text-hi)" style="color:var(--text-muted)" data-testid="kpi-toggle">
        {{ 'admin.dashboard.details' | translate }} <span aria-hidden="true">{{ detailsOpen() ? '▴' : '▾' }}</span>
      </button>
      @if (detailsOpen()) {
        <div id="kpi-more" class="-mt-2 grid grid-cols-1 lg:grid-cols-[auto_auto] justify-center gap-x-6 gap-y-0.5 text-xs text-center"
          style="color:var(--text-muted)">
          <p class="lg:col-span-2" data-testid="kpi-details">
            @if (kpis.pendingCount > 0) { <span class="kpi-number">{{ kpis.pendingCount }}</span> {{ 'admin.dashboard.pending' | translate }} · }
            @if (kpis.expiredCount > 0) { <span class="kpi-number">{{ kpis.expiredCount }}</span> {{ (kpis.expiredCount > 1 ? 'admin.dashboard.expired' : 'admin.dashboard.expiredOne') | translate }} · }
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
          <!-- Jour figé en base (J-2 et avant) : la date du calcul et, en petit lien, le recalcul (après confirmation). -->
          @if (canRecompute()) {
            <div class="lg:col-span-2 mt-2 pt-2 flex flex-col items-center gap-2 text-xs" style="border-top:1px solid var(--border-medium)" data-testid="kpi-frozen">
              <p>
                @if (computedAt(); as at) {
                  {{ 'admin.dashboard.frozenAt' | translate: { date: (at | date: 'dd/MM HH:mm') } }} ·
                } @else {
                  {{ 'admin.dashboard.frozen' | translate }} ·
                }
                <button type="button" (click)="confirming.set(true)" [disabled]="recomputing() || confirming()" class="inline-block text-xs py-2 -my-2 underline underline-offset-2 hover:text-(--text-hi) disabled:opacity-50"
                  data-testid="recompute-link">{{ (recomputing() ? 'admin.challenges.recomputing' : 'admin.challenges.recomputeLink') | translate }}</button>
              </p>
              @if (confirming()) {
                <div class="w-full max-w-sm rounded-lg p-3 flex flex-col gap-2 text-xs" style="background:var(--bg-inactive)" role="alertdialog" data-testid="recompute-confirm">
                  <p style="color:var(--text-hi)">{{ 'admin.challenges.recomputeConfirm' | translate }}</p>
                  <div class="flex justify-center gap-2">
                    <button type="button" appButton variant="primary" size="sm" (click)="confirming.set(false); recompute.emit()" data-testid="recompute-yes">{{ 'admin.challenges.recomputeYes' | translate }}</button>
                    <button type="button" appButton variant="neutral" size="sm" (click)="confirming.set(false)" data-testid="recompute-no">{{ 'admin.challenges.recomputeNo' | translate }}</button>
                  </div>
                </div>
              }
              @if (recomputeErrorKey(); as key) {
                <p role="alert" style="color:var(--text-error)">{{ key | translate }}</p>
              }
            </div>
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
  /** Le détail est déplié d'office (PC) ou replié (téléphone) ; un clic garde le choix jusqu'au prochain changement de cette valeur. */
  readonly openByDefault = input(false);
  protected readonly detailsOpen = linkedSignal(() => this.openByDefault());

  /** Le jour est figé en base (J-2 et avant) : le recalcul est permis. */
  readonly canRecompute = input(false);
  /** Quand les chiffres figés ont été calculés (instant ISO), s'il est connu. */
  readonly computedAt = input<string | null>(null);
  readonly recomputing = input(false);
  /** Clé i18n de l'erreur du dernier recalcul, s'il a échoué. */
  readonly recomputeErrorKey = input<string | null>(null);
  /** Le recalcul est confirmé : l'accueil le lance pour le jour affiché. */
  readonly recompute = output<void>();

  /** La confirmation du recalcul ; retombe quand le jour affiché change. */
  protected readonly confirming = linkedSignal(() => {
    this.kpis();
    return false;
  });
  protected readonly sourceKey = sourceLabelKey;
}
