import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { SessionStore } from '../../core/session/session.store';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { ModalService } from '../../ui/modal/modal.service';
import { ChallengesStore } from '../data-access/challenges.store';
import { ChallengeTrackStats, formatMonth } from '../domain/challenge';
import { ChallengeCardComponent } from '../ui/challenge-card.component';
import { ChallengeHistoryComponent } from '../ui/challenge-history.component';
import { ChallengeMonthNavComponent } from '../ui/challenge-month-nav.component';
import { TrackChartDialog } from './track-chart.dialog';

const DAY_NOT_OVER = 'admin.day_not_over';
const NOT_FOUND = 'common.not_found';
const CHART_DIALOG_MAX_WIDTH = '22.5rem';

/** La clé i18n qui dit pourquoi un recalcul a échoué (le jour n'est pas fini, plus de défi, ou autre chose). */
function recomputeErrorKey(code: string): string {
  if (code === DAY_NOT_OVER) return 'admin.challenges.recomputeNotOver';
  if (code === NOT_FOUND) return 'admin.challenges.recomputeNotFound';
  return errorMessageKey(code);
}

/**
 * `/admin/defis` : « Stats par défi » (30 derniers défis, joueurs, scores, taux par morceau, recalcul
 * des chiffres figés) et « Historique » (tous les défis), sous un navigateur de mois commun. Les deux
 * lectures partent à l'ouverture de l'onglet.
 */
@Component({
  selector: 'app-admin-challenges-page',
  imports: [
    TranslatePipe, ErrorMessageComponent, ChallengeMonthNavComponent, ChallengeCardComponent, ChallengeHistoryComponent,
  ],
  providers: [ChallengesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="flex flex-col gap-4 w-full max-w-2xl" data-testid="admin-challenges-page">

      @if (store.months().length > 0) {
        <app-challenge-month-nav
          [label]="monthLabel()" [canPrevious]="store.canGoPrevious()" [canNext]="store.canGoNext()"
          (previous)="store.shiftMonth(-1)" (next)="store.shiftMonth(1)" />
      }

      <!-- Stats par défi -->
      @if (store.isPending()) {
        <div class="rounded-xl p-5 flex items-center justify-center h-24" style="background:var(--bg-surface)">
          <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.loading' | translate }}</p>
        </div>
      } @else {
        <div class="rounded-xl p-5 flex flex-col gap-3" style="background:var(--bg-surface)">
          <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.statsPerChallenge' | translate }}</h2>
          @if (store.error(); as error) {
            <app-error-message [messageKey]="errorKey(error.code)" [traceId]="error.traceId" />
          } @else if (store.stats().length === 0) {
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.noChallenge' | translate }}</p>
          } @else if (store.statsForMonth().length === 0) {
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.noChallengeThisMonth' | translate }}</p>
          } @else {
            <div class="flex flex-col">
              @for (c of store.statsForMonth(); track c.id) {
                <app-challenge-card
                  [challenge]="c"
                  [expanded]="store.expandedIds().includes(c.id)"
                  [youId]="youId()"
                  [highlightedId]="store.highlightedPlayerId()"
                  [copiedId]="store.copiedPlayerId()"
                  [recomputing]="store.recomputingDays().includes(c.date)"
                  [recomputeErrorKey]="recomputeErrorKeys()[c.date] ?? null"
                  (toggle)="store.toggleExpanded(c.id)"
                  (selectPlayer)="store.toggleHighlight($event)"
                  (copyPlayer)="store.copyPlayerId($event)"
                  (showChart)="openChart($event)"
                  (recompute)="store.recompute($event)" />
              }
            </div>
          }
        </div>
      }

      <!-- Historique des défis -->
      @if (store.isFulfilled()) {
        <div class="rounded-xl p-5 flex flex-col gap-3" style="background:var(--bg-surface)">
          <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.challenges.history' | translate }}</h2>
          @if (store.history().length === 0) {
            <p class="text-sm" style="color:var(--text-slate)">{{ 'admin.challenges.noChallenge' | translate }}</p>
          } @else if (store.historyForMonth().length === 0) {
            <p class="text-sm" style="color:var(--text-slate)">{{ 'admin.challenges.noChallengeThisMonth' | translate }}</p>
          } @else {
            <app-challenge-history [challenges]="store.historyForMonth()" />
          }
        </div>
      }
    </section>
  `,
})
export class ChallengesPage implements OnInit {
  protected readonly store = inject(ChallengesStore);
  private readonly session = inject(SessionStore);
  private readonly modal = inject(ModalService);

  protected readonly monthLabel = computed(() => formatMonth(this.store.month()));
  protected readonly youId = computed(() => this.session.player()?.id ?? null);
  protected readonly recomputeErrorKeys = computed(() =>
    Object.fromEntries(Object.entries(this.store.recomputeErrors()).map(([day, error]) => [day, recomputeErrorKey(error.code)])),
  );
  protected readonly errorKey = errorMessageKey;

  ngOnInit(): void {
    void this.store.load();
  }

  protected openChart(track: ChallengeTrackStats): void {
    this.modal.open(TrackChartDialog, { data: { track }, maxWidth: CHART_DIALOG_MAX_WIDTH });
  }
}
