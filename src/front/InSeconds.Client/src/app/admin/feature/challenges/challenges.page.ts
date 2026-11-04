import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { WIDE_SCREEN } from '../../../core/layout/wide-screen';
import { SessionStore } from '../../../core/session/session.store';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { ChallengesStore } from '../../data-access/challenges.store';
import { ChallengeTrackStats, formatMonth } from '../../domain/challenge';
import { ChallengeCardComponent } from '../../ui/challenges/challenge-card/challenge-card.component';
import { ChallengeMonthNavComponent } from '../../ui/challenges/challenge-month-nav/challenge-month-nav.component';
import { ChallengeTableComponent } from '../../ui/challenges/challenge-table/challenge-table.component';
import { TrackChartDialog } from './track-chart/track-chart.dialog';

const NOT_FOUND = 'common.not_found';
const CHART_DIALOG_MAX_WIDTH = '22.5rem';

/**
 * La clé i18n qui dit pourquoi un recalcul a échoué : la table commune (`admin.day_not_over`, jour pas fini…), sauf un 404, qui
 * veut dire ici « plus de défi ce jour-là ».
 */
function recomputeErrorKey(code: string): string {
  if (code === NOT_FOUND) return 'admin.challenges.recomputeNotFound';
  return errorMessageKey(code);
}

/** Le mois de l'adresse (`?mois=aaaa-mm`), s'il est bien formé. */
function monthParam(value: string | null): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/**
 * `/admin/defis` : les défis d'un mois (joueurs, scores, taux par morceau, recalcul des chiffres figés), sous un navigateur de mois qui
 * parcourt tous les mois qui ont un défi (un mois plus ancien que les 30 derniers défis est lu quand on y arrive).
 * Sur téléphone, un défi par carte, qu'on déplie. Sur PC, le mois en tableau, et le détail du défi sélectionné à droite (le plus récent
 * par défaut). Le mois affiché vit dans l'adresse (`?mois=2026-10`) : un rechargement ou un lien le rouvre.
 */
@Component({
  selector: 'app-admin-challenges-page',
  imports: [
    NgTemplateOutlet, TranslatePipe, ErrorMessageComponent, ChallengeMonthNavComponent, ChallengeCardComponent, ChallengeTableComponent,
  ],
  providers: [ChallengesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="flex flex-col gap-4 w-full max-w-2xl lg:max-w-none" data-testid="admin-challenges-page">

      <ng-template #monthNav>
        @if (store.months().length > 0) {
          <app-challenge-month-nav
            [label]="monthLabel()" [canPrevious]="store.canGoPrevious()" [canNext]="store.canGoNext()"
            (previous)="shiftMonth(-1)" (next)="shiftMonth(1)" />
        }
      </ng-template>

      <!-- Téléphone : le mois au-dessus de la carte ; PC : au-dessus du tableau, dans sa colonne. -->
      @if (!wide()) {
        <ng-container *ngTemplateOutlet="monthNav" />
      }

      <!-- Stats par défi -->
      @if (store.isPending()) {
        <div class="rounded-xl p-5 flex items-center justify-center h-24" style="background:var(--bg-surface)">
          <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.loading' | translate }}</p>
        </div>
      } @else {
        <div class="rounded-xl flex flex-col gap-3" [class]="wide() ? 'p-5 pt-3' : 'p-5'" style="background:var(--bg-surface)">
          @if (!wide()) {
            <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.dashboard.statsPerChallenge' | translate }}</h2>
          }
          @if (store.error(); as error) {
            <app-error-message [messageKey]="errorKey(error.code)" [traceId]="error.traceId" />
          } @else if (store.stats().length === 0) {
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.noChallenge' | translate }}</p>
          } @else if (store.statsForMonth().length === 0 && store.loadingMonth() === store.month()) {
            <p class="text-sm" style="color:var(--text-muted)" data-testid="challenges-month-loading">{{ 'admin.dashboard.loading' | translate }}</p>
          } @else if (store.statsForMonth().length === 0) {
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.dashboard.noChallengeThisMonth' | translate }}</p>
          } @else if (wide()) {
            <div class="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-5 items-start">
              <div class="flex flex-col gap-1 min-w-0 self-start">
                <div class="self-start"><ng-container *ngTemplateOutlet="monthNav" /></div>
                <app-challenge-table class="block w-full" [challenges]="store.statsForMonth()" [selectedId]="selectedId()"
                  (selectChallenge)="picked.set($event)" />
              </div>
              @if (selected(); as c) {
                <div class="rounded-lg px-4 pb-3 sticky top-4" style="background:var(--bg-inactive)" data-testid="challenge-detail">
                  <app-challenge-card
                    [challenge]="c" [expanded]="true" [collapsible]="false" [youId]="youId()"
                    [highlightedId]="store.highlightedPlayerId()" [copiedId]="store.copiedPlayerId()"
                    [recomputing]="store.recomputingDays().includes(c.date)"
                    [recomputeErrorKey]="recomputeErrorKeys()[c.date] ?? null"
                    (selectPlayer)="store.toggleHighlight($event)" (copyPlayer)="store.copyPlayerId($event)"
                    (showChart)="openChart($event)" (recompute)="store.recompute($event)" />
                </div>
              }
            </div>
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
                  (toggled)="store.toggleExpanded(c.id)"
                  (selectPlayer)="store.toggleHighlight($event)"
                  (copyPlayer)="store.copyPlayerId($event)"
                  (showChart)="openChart($event)"
                  (recompute)="store.recompute($event)" />
              }
            </div>
          }
        </div>
      }

    </section>
  `,
})
export class ChallengesPage {
  protected readonly store = inject(ChallengesStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** PC : le tableau du mois et le détail du défi sélectionné ; téléphone : les cartes. */
  protected readonly wide = inject(WIDE_SCREEN);
  /** Le défi choisi dans le tableau (PC) ; sans choix, ou s'il n'est pas dans le mois affiché, le plus récent du mois. */
  protected readonly picked = signal<number | null>(null);
  protected readonly selected = computed(() => {
    const month = this.store.statsForMonth();
    return month.find(c => c.id === this.picked()) ?? month[0] ?? null;
  });
  protected readonly selectedId = computed(() => this.selected()?.id ?? null);
  private readonly session = inject(SessionStore);
  private readonly modal = inject(ModalService);
  private readonly language = inject(LanguageService);

  protected readonly monthLabel = computed(() => formatMonth(this.store.month(), this.language.current()));
  protected readonly youId = computed(() => this.session.player()?.id ?? null);
  protected readonly recomputeErrorKeys = computed(() =>
    Object.fromEntries(Object.entries(this.store.recomputeErrors()).map(([day, error]) => [day, recomputeErrorKey(error.code)])),
  );
  protected readonly errorKey = errorMessageKey;

  constructor() {
    void this.store.requestMonth(monthParam(this.route.snapshot.queryParamMap.get('mois')));
    // Le mois affiché → adresse, une fois les défis lus (avant, le mois n'est pas connu). `replaceUrl` : « précédent » ne revient pas mois par mois.
    effect(() => {
      if (!this.store.isFulfilled()) return;
      const month = this.store.month();
      untracked(() => void this.router.navigate([], {
        relativeTo: this.route, queryParams: { mois: month }, queryParamsHandling: 'merge', replaceUrl: true,
      }));
    });
    void this.store.load();
  }

  protected shiftMonth(delta: 1 | -1): void {
    void this.store.shiftMonth(delta);
    this.picked.set(null);
  }

  protected openChart(track: ChallengeTrackStats): void {
    this.modal.open(TrackChartDialog, { data: { track }, maxWidth: CHART_DIALOG_MAX_WIDTH });
  }
}
