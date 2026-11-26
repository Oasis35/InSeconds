import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../../core/errors/error-messages';
import { LanguageService } from '../../../core/i18n/language.service';
import { WIDE_SCREEN } from '../../../core/layout/wide-screen';
import { SessionStore } from '../../../core/session/session.store';
import { ErrorMessageComponent } from '../../../ui/error-message/error-message.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { ChallengesStore } from '../../data-access/challenges.store';
import { DashboardStore } from '../../data-access/dashboard.store';
import { ChallengeTrackStats, formatMonth, monthOf } from '../../domain/challenge';
import { parseDay, todayUtc } from '../../domain/dashboard';
import { ChallengePlayerChipsComponent } from '../../ui/challenges/challenge-player-chips/challenge-player-chips.component';
import { ChallengeScoreChartComponent } from '../../ui/challenges/challenge-score-chart/challenge-score-chart.component';
import { ChallengeTrackStatsComponent } from '../../ui/challenges/challenge-track-stats/challenge-track-stats.component';
import { DashboardActivityComponent } from '../../ui/dashboard/dashboard-activity/dashboard-activity.component';
import { DashboardDayNavComponent } from '../../ui/dashboard/dashboard-day-nav/dashboard-day-nav.component';
import { DashboardKpisComponent } from '../../ui/dashboard/dashboard-kpis/dashboard-kpis.component';
import { DashboardPlayersComponent } from '../../ui/dashboard/dashboard-players/dashboard-players.component';
import { ChallengeTableComponent } from '../../ui/challenges/challenge-table/challenge-table.component';
import { TrackChartDialog } from './track-chart/track-chart.dialog';

const NOT_FOUND = 'common.not_found';
const CHART_DIALOG_MAX_WIDTH = '22.5rem';

/**
 * `/admin/dashboard` (onglet « Accueil ») : tout ce qu'on regarde dans la journée, sans changer d'onglet.
 * - La carte du jour : ‹ jour › (« Aujourd'hui · en direct »), trois tuiles (ont fini, nouveaux joueurs, score médian) et leur
 *   détail déplié d'office sur PC, replié sur téléphone (en cours, abandons, part qui finit, comptes créés, arrivés, habitués et nouveaux).
 * - Le détail du défi du jour, rangé comme dans l'onglet Défis : sur PC, une colonne à droite (la répartition des scores, les joueurs
 *   du jour, puis les morceaux du jour, dépliés) ; sur téléphone, dans la carte (les joueurs, puis les morceaux, repliés ; pas de
 *   répartition).
 * - Un clic sur la date ouvre le calendrier du mois : n'importe quel jour qui a un défi (ses joueurs et ses morceaux sont lus à la demande
 *   au-delà des 30 derniers). Un jour figé en base (J-2 et avant) montre, en bas du « Détail », sa date de calcul et un lien « Recalculer » (avec confirmation).
 * - L'activité des 30 derniers jours (un clic sur une barre change de jour), les totaux des joueurs, puis les défis du mois (tableau replié).
 * Le jour affiché vit dans l'adresse (`?jour=2026-11-03`, absent pour aujourd'hui) : un F5 rouvre le même jour.
 */
@Component({
  selector: 'app-admin-dashboard-page',
  imports: [
    NgTemplateOutlet, TranslatePipe, ErrorMessageComponent, DashboardDayNavComponent, DashboardKpisComponent, DashboardActivityComponent,
    DashboardPlayersComponent, ChallengePlayerChipsComponent, ChallengeScoreChartComponent, ChallengeTrackStatsComponent, ChallengeTableComponent,
  ],
  providers: [DashboardStore, ChallengesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <ng-template #tracks let-list>
      <!-- Les morceaux du jour : dépliés d'office sur PC, repliés sur téléphone. -->
      <button type="button" (click)="tracksOpen.set(!tracksOpen())" [attr.aria-expanded]="tracksOpen()"
        class="self-start py-2 -my-2 text-xs hover:text-(--text-hi)" style="color:var(--text-muted)" data-testid="day-tracks-toggle">
        {{ 'admin.dashboard.dayTracks' | translate }} <span aria-hidden="true">{{ tracksOpen() ? '▴' : '▾' }}</span>
      </button>
      @if (tracksOpen()) {
        <div class="flex flex-col gap-2" data-testid="day-tracks">
          @for (t of list; track t.position) {
            <app-challenge-track-stats [track]="t" (showChart)="openChart($event)" />
          }
        </div>
      }
    </ng-template>

    <ng-template #players let-c>
      @if (c.players.length > 0) {
        <div data-testid="day-players">
          <app-challenge-player-chips [players]="c.players" [youId]="youId()"
            [highlightedId]="challenges.highlightedPlayerId()" [copiedId]="challenges.copiedPlayerId()"
            (playerSelected)="challenges.toggleHighlight($event)" (playerCopied)="challenges.copyPlayerId($event)" />
        </div>
      }
    </ng-template>

    <section class="w-full max-w-2xl lg:max-w-none grid gap-4 lg:grid-cols-2 lg:items-start" data-testid="admin-dashboard-page">
      @if (store.error(); as error) {
        <app-error-message class="lg:col-span-2" [messageKey]="errorMessageKey(error.code)" [traceId]="error.traceId" />
      }

      @if (store.dashboard(); as dashboard) {
        <div class="flex flex-col gap-4 min-w-0">
          <div class="rounded-xl p-4 flex flex-col gap-3" style="background:var(--bg-surface)" data-testid="day-card">
            <app-dashboard-day-nav
              [day]="store.selectedDay()" [locale]="locale()" [isToday]="store.isSelectedDayToday()"
              [canGoToPrevious]="store.canGoToPreviousDay()" [canGoToNext]="store.canGoToNextDay()"
              [availableDays]="dashboard.availableDays"
              (previous)="store.shiftDay(-1)" (next)="store.shiftDay(1)" (daySelected)="store.selectDay($event)" />
            <app-dashboard-kpis class="flex flex-col gap-3" [kpis]="dashboard.kpis" [openByDefault]="wide()"
              [canRecompute]="dayChallenge()?.canRecompute ?? false" [computedAt]="dayChallenge()?.computedAt ?? null"
              [recomputing]="recomputing()" [recomputeErrorKey]="recomputeErrorKey()" (recompute)="recompute()" />

            <!-- Téléphone : les joueurs puis les morceaux du jour dans la carte (sur PC, dans la colonne de droite). -->
            @if (!wide()) {
              @if (dayChallenge(); as c) {
                <div class="pt-3 flex flex-col gap-3" style="border-top:1px solid var(--border-medium)">
                  <ng-container *ngTemplateOutlet="players; context: { $implicit: c }" />
                  <ng-container *ngTemplateOutlet="tracks; context: { $implicit: c.tracks }" />
                </div>
              }
            }
          </div>

          <app-dashboard-activity
            [activity]="dashboard.activity" [selectedDay]="store.selectedDay()" [total]="store.totalPlayers()"
            [peak]="store.maxDailyPlayers()" [locale]="locale()" (daySelected)="store.selectDay($event)" />
          <app-dashboard-players [players]="dashboard.players" />

          <!-- Les défis du mois du jour affiché, replié d'office : un clic sur une ligne change le jour de la carte. -->
          @if (monthChallenges().length > 0) {
            <div class="rounded-(--radius-card) p-4 flex flex-col gap-3" style="background:var(--bg-surface)" data-testid="month-challenges">
              <button type="button" (click)="monthOpen.set(!monthOpen())" [attr.aria-expanded]="monthOpen()"
                class="min-h-11 flex items-center justify-between gap-2 text-left text-sm font-semibold" style="color:var(--text-muted)"
                data-testid="month-challenges-toggle">
                <span>{{ 'admin.dashboard.monthChallenges' | translate: { month: monthLabel() } }}</span>
                <span aria-hidden="true">{{ monthOpen() ? '▴' : '▾' }}</span>
              </button>
              @if (monthOpen()) {
                <div class="overflow-x-auto">
                  <app-challenge-table class="block min-w-[22rem]" [challenges]="monthChallenges()" [selectedId]="dayChallenge()?.id ?? null"
                    (selectChallenge)="pickChallenge($event)" />
                </div>
              }
            </div>
          }
        </div>

        @if (wide()) {
          @if (dayChallenge(); as c) {
            <!-- PC : comme le détail d'un défi dans l'onglet Défis, la répartition des scores, les joueurs, puis les morceaux. -->
            <div class="rounded-xl p-4 flex flex-col gap-3 min-w-0" style="background:var(--bg-surface)" data-testid="day-detail">
              <app-challenge-score-chart [challenge]="c" [ruled]="false" />
              <ng-container *ngTemplateOutlet="players; context: { $implicit: c }" />
              <div class="pt-3 flex flex-col gap-3" style="border-top:1px solid var(--border-medium)">
                <ng-container *ngTemplateOutlet="tracks; context: { $implicit: c.tracks }" />
              </div>
            </div>
          }
        }
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
  /** Les stats des 30 derniers défis : les joueurs et les morceaux du jour affiché. */
  protected readonly challenges = inject(ChallengesStore);
  protected readonly errorMessageKey = errorMessageKey;
  protected readonly wide = inject(WIDE_SCREEN);
  private readonly language = inject(LanguageService);
  private readonly session = inject(SessionStore);
  private readonly modal = inject(ModalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly locale = computed(() => this.language.current());
  protected readonly youId = computed(() => this.session.player()?.id ?? null);
  /** Les morceaux du jour sont dépliés : d'office sur PC, repliés sur téléphone ; un clic garde le choix jusqu'au prochain changement de mise en page. */
  protected readonly tracksOpen = linkedSignal(() => this.wide());
  /** Le défi du jour affiché, s'il est parmi les 30 derniers (ses joueurs et ses morceaux) ; sinon rien. */
  protected readonly dayChallenge = computed(() => this.challenges.stats().find(c => c.date === this.store.selectedDay()) ?? null);

  /** Les défis du mois du jour affiché (lus à la demande), pour le tableau replié. */
  protected readonly monthChallenges = computed(() => this.challenges.statsForMonth());
  protected readonly monthLabel = computed(() => formatMonth(this.challenges.month(), this.language.current()));
  protected readonly monthOpen = signal(false);
  protected readonly recomputing = computed(() => {
    const day = this.store.selectedDay();
    return day !== null && this.challenges.recomputingDays().includes(day);
  });
  /** La clé i18n de l'échec du dernier recalcul du jour affiché : la table commune, sauf un 404 (« plus de défi ce jour-là »). */
  protected readonly recomputeErrorKey = computed(() => {
    const day = this.store.selectedDay();
    const error = day === null ? undefined : this.challenges.recomputeErrors()[day];
    if (!error) return null;
    return error.code === NOT_FOUND ? 'admin.challenges.recomputeNotFound' : errorMessageKey(error.code);
  });

  constructor() {
    const day = parseDay(this.route.snapshot.queryParamMap.get('jour'));
    // Le jour affiché → adresse, une fois lu ; aujourd'hui n'y est pas écrit. `replaceUrl` : « précédent » ne revient pas jour par jour.
    effect(() => {
      const selected = this.store.selectedDay();
      if (selected === null) return;
      untracked(() => void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { jour: selected === todayUtc(new Date()) ? null : selected },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }));
    });
    // Le mois du jour affiché est lu à la demande : un jour de plus de 30 défis a ses joueurs et ses morceaux après un instant.
    effect(() => {
      const selected = this.store.selectedDay();
      if (selected === null) return;
      untracked(() => void this.challenges.requestMonth(monthOf(selected)));
    });
    void this.store.load(day ?? undefined);
    void this.challenges.load();
  }

  protected pickChallenge(id: number): void {
    const day = this.challenges.statsForMonth().find(c => c.id === id)?.date;
    if (day) void this.store.selectDay(day);
  }

  /** Recalcule le jour affiché, puis relit l'accueil : les chiffres du jour viennent de la photo figée, que le recalcul vient de refaire. */
  protected async recompute(): Promise<void> {
    const day = this.store.selectedDay();
    if (day === null) return;
    await this.challenges.recompute(day);
    if (!this.challenges.recomputeErrors()[day]) await this.store.load(day);
  }

  protected openChart(track: ChallengeTrackStats): void {
    this.modal.open(TrackChartDialog, { data: { track }, maxWidth: CHART_DIALOG_MAX_WIDTH });
  }
}
