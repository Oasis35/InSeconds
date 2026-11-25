import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { HomeAnnounceSlotComponent } from '../../../core/shell/home-announce-slot/home-announce-slot.component';
import { InstallLineComponent } from '../../../core/shell/install-line/install-line.component';
import { HomeModeEntriesComponent } from '../../../core/shell/home-mode-entries/home-mode-entries.component';
import { secondsUntilMidnightUtc, timeLeft, todayUtc } from '../../../core/game-day/game-day';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { GuestStreakNotice } from '../../data-access/guest-streak-notice';
import { formatGameDate } from '../../domain/archive';
import { GuestAccountTileComponent } from '../../ui/guest-account-tile/guest-account-tile.component';
import { HomeAbandonedCardComponent } from '../../ui/home-abandoned-card/home-abandoned-card.component';
import { HomeChallengeCardComponent } from '../../ui/home-challenge-card/home-challenge-card.component';
import { HomeDoneCardComponent } from '../../ui/home-done-card/home-done-card.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';
import { DailyResultView, DailyStartup, StreakSheetOpener } from '../daily-shell/daily-view';

/**
 * L'accueil (`/`), neutre : ni le défi ni la Survie, mais leurs cartes, avec **une seule tuile du moment** (la prochaine action). Défi à jouer :
 * la carte du défi en tête, puis la carte amis et la carte Survie. Défi fait : la carte Survie passe devant si le joueur y a accès
 * (`placement="lead"`), puis le résultat (« Détail » déplie les morceaux et les scores du jour dans la carte), puis la carte amis. Les cartes des autres domaines
 * arrivent par `<app-home-mode-entries>` : le Daily n'importe ni `social` ni `runs`. Les stores
 * sont ceux de la coquille du jeu du jour : « Commencer » lance la partie dans ce toucher, et la coquille passe sur `/daily` pour la manche.
 */
@Component({
  selector: 'app-home-page',
  imports: [
    TranslatePipe, RouterLink, ButtonComponent, DecorBackgroundComponent, BrandComponent, InstagramLinkComponent, AccountLinkComponent, HomeAnnounceSlotComponent, HomeModeEntriesComponent, InstallLineComponent, HomeLegalLineComponent,
    HomeChallengeCardComponent, HomeDoneCardComponent, GuestAccountTileComponent, HomeAbandonedCardComponent, StatusScreenComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="da-bg min-h-dvh flex flex-col relative" style="color:var(--text-body)">
      <app-decor-background />

      <main class="relative flex-1 flex flex-col px-5 pt-2 pb-5 w-full max-w-lg mx-auto overflow-x-clip" data-testid="home">
        <header class="pb-6">
          <app-brand>
            @if (screen() !== 'loading') {
              <div brandRight class="flex items-center gap-2">
                <app-account-link />
                <app-instagram-link />
              </div>
            }
          </app-brand>
        </header>

        @if (screen() === 'welcome' || screen() === 'resume_prompt' || screen() === 'already_played' || screen() === 'done' || screen() === 'no_challenge') {
          <app-home-announce-slot />
        }

        @switch (screen()) {
          @case ('welcome') {
            <div class="screen-enter flex flex-col gap-3" data-testid="home-v4">
              <app-home-challenge-card
                [dateLabel]="dateLabel()"
                [trackCount]="store.peekTracksCount()"
                [streak]="store.pillStreak()"
                [bestScore]="store.bestScore()"
                [yesterdayMedian]="store.yesterdayMedian()"
                [remaining]="remaining()"
                [firstGame]="store.firstGame()"
                [linked]="store.linked()"
                (startGame)="store.begin()"
                (openStreak)="streakSheet.open()" />
              <!-- « Créer un compte » d'un invité : la tuile juste dessous, seulement s'il a déjà joué ou perdu une série. -->
              @if (store.guestTile(); as tile) {
                <app-guest-account-tile [kind]="tile" [streak]="tile === 'lost' ? (store.lostStreak() ?? 0) : store.toastStreak()" (dismissed)="dismissGuestTile()" />
              }
            </div>
            <app-home-mode-entries />
          }
          @case ('resume_prompt') {
            <div class="screen-enter flex flex-col gap-3" data-testid="home-v4">
              <app-home-challenge-card
                [dateLabel]="dateLabel()"
                [trackCount]="store.peekTracksCount()"
                [streak]="store.pillStreak()"
                [linked]="store.linked()"
                [completedCount]="store.peekCompletedCount()"
                [abandonLoading]="store.abandonLoading()"
                (startGame)="store.begin()"
                (abandon)="confirmAbandonFromResume()"
                (openStreak)="streakSheet.open()" />
              @if (!store.linked()) {
                <a appButton variant="neutral" [block]="true" routerLink="/account/login" data-testid="home-login">{{ 'daily.resume.loginCta' | translate }}</a>
              }
            </div>
            <app-home-mode-entries />
          }
          @case ('already_played') {
            <!-- Défi fait : la carte Survie (si le joueur y a accès) passe devant, c'est la prochaine action. -->
            <app-home-mode-entries #lead placement="lead" class="block" [class.-mt-3]="lead.hasLeadingEntry()" [class.mb-3]="lead.hasLeadingEntry()" />
            <div class="screen-enter flex flex-col gap-3" data-testid="home-v4" data-fresh="false">
              @if (store.abandoned()) {
                <app-home-abandoned-card [countdown]="store.countdown()" [score]="store.stats()?.abandonedScore ?? null" [pending]="store.stats() === null" [rows]="result.rows()" [lang]="language.current()" />
              } @else {
                <app-home-done-card
                  [maxScore]="store.maxScore()"
                  [verdict]="store.dayVerdict()"
                  [score]="store.stats()?.yourScore ?? null"
                  [rows]="result.rows()"
                  [countdown]="store.countdown()"
                  [betterThanPercent]="store.stats()?.betterThanPercent ?? null"
                  [history]="store.stats()?.history ?? null"
                  [stats]="store.stats()"
                  [focus]="!lead.hasLeadingEntry()"
                  [lang]="language.current()"
                  [streak]="store.pillStreak()"
                  [linked]="store.linked()"
                  [gelEvent]="store.toasts().gelEarned ? 'earned' : store.toasts().gelUsed ? 'used' : null"
                  [freezesUsed]="store.freezesUsed()"
                  (openStreak)="streakSheet.open()"
                  [shareCopied]="result.copied()"
                  [shareFailed]="result.failed()"
                  [canShare]="store.stats()?.yourScore != null"
                  (share)="result.share()" />
              }
              @if (store.guestTile(); as tile) {
                <app-guest-account-tile [kind]="tile" [streak]="tile === 'lost' ? (store.lostStreak() ?? 0) : store.toastStreak()" (dismissed)="dismissGuestTile()" />
              }
            </div>
            <app-home-mode-entries placement="rest" />
            <app-install-line class="mt-3" [gamesPlayed]="store.gamesPlayed()" />
          }
          @case ('done') {
            <!-- Défi fait : la carte Survie (si le joueur y a accès) passe devant, c'est la prochaine action. -->
            <app-home-mode-entries #lead placement="lead" class="block" [class.-mt-3]="lead.hasLeadingEntry()" [class.mb-3]="lead.hasLeadingEntry()" />
            <div class="screen-enter flex flex-col gap-3" data-testid="home-v4" data-fresh="true">
              <app-home-done-card
                  [maxScore]="store.maxScore()"
                  [verdict]="store.dayVerdict()"
                [score]="result.displayedTotal()"
                [rows]="result.rows()"
                [countdown]="store.countdown()"
                [betterThanPercent]="store.stats()?.betterThanPercent ?? null"
                [history]="store.stats()?.history ?? null"
                [stats]="store.stats()"
                [focus]="!lead.hasLeadingEntry()"
                [lang]="language.current()"
                [streak]="store.pillStreak()"
                [linked]="store.linked()"
                [gelEvent]="store.toasts().gelEarned ? 'earned' : store.toasts().gelUsed ? 'used' : null"
                [freezesUsed]="store.freezesUsed()"
                (openStreak)="streakSheet.open()"
                [shareCopied]="result.copied()"
                [shareFailed]="result.failed()"
                [canShare]="store.canShare()"
                (share)="result.share()" />
              @if (store.guestTile(); as tile) {
                <app-guest-account-tile [kind]="tile" [streak]="tile === 'lost' ? (store.lostStreak() ?? 0) : store.toastStreak()" (dismissed)="dismissGuestTile()" />
              }
            </div>
            <app-home-mode-entries placement="rest" />
            <app-install-line class="mt-3" [gamesPlayed]="store.gamesPlayed()" />
          }
          @case ('no_challenge') {
            <app-status-screen titleKey="daily.noChallenge.title" bodyKey="daily.noChallenge.body" (retry)="store.retryNoChallenge()" />
            <app-home-mode-entries />
          }
          @case ('error') {
            <app-status-screen titleKey="daily.error.title" bodyKey="daily.error.body" [errorCode]="errorReporting.lastErrorCode()" (retry)="startup.run()" />
          }
          @default {
            <div class="flex-1 flex items-center justify-center">
              <p class="text-sm animate-pulse" style="color:var(--text-faint)">{{ 'daily.common.loading' | translate }}</p>
            </div>
          }
        }
      </main>
      @if (screen() !== 'loading') { <app-home-legal-line class="mt-auto" /> }
    </div>
  `,
})
export class HomePage {
  protected readonly store = inject(DailyGameStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  protected readonly streakSheet = inject(StreakSheetOpener);
  protected readonly result = inject(DailyResultView);
  protected readonly startup = inject(DailyStartup);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly guestNotice = inject(GuestStreakNotice);

  /** L'écran affiché : celui du jeu du jour. */
  protected readonly screen = this.store.screen;

  protected readonly dateLabel = computed(() => formatGameDate(todayUtc(new Date()), this.language.current(), 'weekday'));
  /** Le temps qu'il reste pour jouer le défi, dit à côté du score à battre (« plus que 6 h »). */
  protected readonly remaining = computed(() => timeLeft(secondsUntilMidnightUtc(new Date())));

  /** La croix de la tuile « crée un compte » : fermée pour de bon, gardée dans le navigateur (règles dans `domain/toasts`). */
  protected dismissGuestTile(): void {
    this.guestNotice.remember(this.store.dismissGuestTile());
  }

  /** Abandonner depuis la carte en pause : la même confirmation que l'ancien écran de reprise (la progression et la série sont perdues). */
  protected async confirmAbandonFromResume(): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('daily.resume.warningTitle'),
      body: this.translate.instant(this.store.linked() ? 'daily.resume.warningBodyLinked' : 'daily.resume.warningBody'),
      confirmLabel: this.translate.instant('daily.resume.confirmAbandon'),
      cancelLabel: this.translate.instant('daily.resume.cancelAbandon'),
      tone: 'danger',
    });
    if (confirmed) await this.store.abandonFromResume();
  }
}
