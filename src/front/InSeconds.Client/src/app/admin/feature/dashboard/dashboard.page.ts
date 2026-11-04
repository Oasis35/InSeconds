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
import { DashboardStore } from '../../data-access/dashboard.store';
import { ChallengeTrackStats } from '../../domain/challenge';
import { parseDay, todayUtc } from '../../domain/dashboard';
import { ChallengePlayerChipsComponent } from '../../ui/challenges/challenge-player-chips/challenge-player-chips.component';
import { ChallengeTrackStatsComponent } from '../../ui/challenges/challenge-track-stats/challenge-track-stats.component';
import { DashboardActivityComponent } from '../../ui/dashboard/dashboard-activity/dashboard-activity.component';
import { DashboardDayNavComponent } from '../../ui/dashboard/dashboard-day-nav/dashboard-day-nav.component';
import { DashboardKpisComponent } from '../../ui/dashboard/dashboard-kpis/dashboard-kpis.component';
import { DashboardPlayersComponent } from '../../ui/dashboard/dashboard-players/dashboard-players.component';
import { TrackChartDialog } from '../challenges/track-chart/track-chart.dialog';

const CHART_DIALOG_MAX_WIDTH = '22.5rem';

/**
 * `/admin/dashboard` (onglet « Accueil ») : tout ce qu'on regarde dans la journée, sans changer d'onglet.
 * - La carte du jour : ‹ jour › (« Aujourd'hui · en direct »), trois tuiles (ont fini, nouveaux joueurs, score médian), une ligne
 *   secondaire (en cours, abandons, part qui finit, comptes créés), puis les joueurs du jour (les chips de l'onglet Défis).
 * - Les morceaux du jour : repliés sous la carte sur téléphone, dépliés dans une colonne à droite sur PC.
 * - L'activité des 30 derniers jours (un clic sur une barre change de jour), puis les totaux des joueurs, en une ligne.
 * Le jour affiché vit dans l'adresse (`?jour=2026-11-03`, absent pour aujourd'hui) : un F5 rouvre le même jour.
 */
@Component({
  selector: 'app-admin-dashboard-page',
  imports: [
    NgTemplateOutlet, TranslatePipe, ErrorMessageComponent, DashboardDayNavComponent, DashboardKpisComponent, DashboardActivityComponent,
    DashboardPlayersComponent, ChallengePlayerChipsComponent, ChallengeTrackStatsComponent,
  ],
  providers: [DashboardStore, ChallengesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <ng-template #tracks let-list>
      <div class="flex flex-col gap-2" data-testid="day-tracks">
        @for (t of list; track t.position) {
          <app-challenge-track-stats [track]="t" (showChart)="openChart($event)" />
        }
      </div>
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
              (previous)="store.shiftDay(-1)" (next)="store.shiftDay(1)" />
            <app-dashboard-kpis class="flex flex-col gap-3" [kpis]="dashboard.kpis" />

            @if (dayChallenge(); as c) {
              @if (c.players.length > 0) {
                <div class="pt-1" style="border-top:1px solid var(--border-medium)" data-testid="day-players">
                  <app-challenge-player-chips [players]="c.players" [youId]="youId()"
                    [highlightedId]="challenges.highlightedPlayerId()" [copiedId]="challenges.copiedPlayerId()"
                    (playerSelected)="challenges.toggleHighlight($event)" (playerCopied)="challenges.copyPlayerId($event)" />
                </div>
              }
              @if (!wide()) {
                <button type="button" (click)="tracksOpen.set(!tracksOpen())" [attr.aria-expanded]="tracksOpen()"
                  class="self-start text-xs hover:text-(--text-hi)" style="color:var(--text-muted)">
                  {{ 'admin.dashboard.dayTracks' | translate }} <span aria-hidden="true">{{ tracksOpen() ? '▴' : '▾' }}</span>
                </button>
                @if (tracksOpen()) {
                  <ng-container *ngTemplateOutlet="tracks; context: { $implicit: c.tracks }" />
                }
              }
            }
          </div>

          <app-dashboard-activity
            [activity]="dashboard.activity" [selectedDay]="store.selectedDay()" [total]="store.totalPlayers()"
            [peak]="store.maxDailyPlayers()" [locale]="locale()" (daySelected)="store.selectDay($event)" />
          <app-dashboard-players [players]="dashboard.players" />
        </div>

        @if (wide()) {
          @if (dayChallenge(); as c) {
            <div class="rounded-xl p-4 flex flex-col gap-3 min-w-0" style="background:var(--bg-surface)">
              <h2 class="text-sm font-semibold" style="color:var(--text-muted)">{{ 'admin.dashboard.dayTracks' | translate }}</h2>
              <ng-container *ngTemplateOutlet="tracks; context: { $implicit: c.tracks }" />
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
  /** Les morceaux du jour sont dépliés sous la carte (téléphone). */
  protected readonly tracksOpen = signal(false);
  /** Le défi du jour affiché, s'il est parmi les 30 derniers (ses joueurs et ses morceaux) ; sinon rien. */
  protected readonly dayChallenge = computed(() => this.challenges.stats().find(c => c.date === this.store.selectedDay()) ?? null);

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
    void this.store.load(day ?? undefined);
    void this.challenges.load();
  }

  protected openChart(track: ChallengeTrackStats): void {
    this.modal.open(TrackChartDialog, { data: { track }, maxWidth: CHART_DIALOG_MAX_WIDTH });
  }
}
