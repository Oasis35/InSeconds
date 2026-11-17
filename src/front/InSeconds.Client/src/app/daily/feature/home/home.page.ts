import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { HomeModeEntriesComponent } from '../../../core/shell/home-mode-entries/home-mode-entries.component';
import { secondsUntilMidnightUtc, timeLeft, todayUtc } from '../../../core/game-day/game-day';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { formatGameDate } from '../../domain/archive';
import { HomeAbandonedCardComponent } from '../../ui/home-abandoned-card/home-abandoned-card.component';
import { HomeChallengeCardComponent } from '../../ui/home-challenge-card/home-challenge-card.component';
import { HomeDoneCardComponent } from '../../ui/home-done-card/home-done-card.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';
import { DailyResultView, DailyStartup, StreakSheetOpener, visibleScreen } from '../daily-shell/daily-view';

/**
 * L'accueil (`/`), neutre : ni le défi ni la Survie, mais leurs cartes. Sous la V4, la carte du défi porte tous ses états (à jouer, en pause,
 * abandonné, fait avec le score qui monte juste après la partie), la carte Survie (projetée par `<app-home-mode-entries>`) est dessous. Les stores
 * sont ceux de la coquille du jeu du jour : « Commencer » lance la partie dans ce toucher, et la coquille passe sur `/daily` pour la manche.
 * Sans la V4, la coquille renvoie la racine au défi : la page n'affiche alors qu'un chargement.
 */
@Component({
  selector: 'app-home-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, BrandComponent, InstagramLinkComponent, AccountLinkComponent, HomeModeEntriesComponent, HomeLegalLineComponent,
    HomeChallengeCardComponent, HomeDoneCardComponent, HomeAbandonedCardComponent, StatusScreenComponent,
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
                <app-instagram-link />
                <app-account-link />
              </div>
            }
          </app-brand>
        </header>

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
                [linked]="store.linked()"
                (startGame)="store.begin()"
                (openStreak)="streakSheet.open()" />
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
            </div>
            <app-home-mode-entries />
          }
          @case ('already_played') {
            <div class="screen-enter flex flex-col gap-3" data-testid="home-v4">
              @if (store.abandoned()) {
                <app-home-abandoned-card [countdown]="store.countdown()" />
              } @else {
                <app-home-done-card
                  [score]="store.stats()?.yourScore ?? null"
                  [rows]="result.rows()"
                  [countdown]="store.countdown()"
                  [betterThanPercent]="store.stats()?.betterThanPercent ?? null"
                  [history]="store.stats()?.history ?? null"
                  [lang]="language.current()"
                  [streak]="store.pillStreak()"
                  [linked]="store.linked()"
                  (openStreak)="streakSheet.open()"
                  [shareCopied]="result.copied()"
                  [shareFailed]="result.failed()"
                  [canShare]="store.stats()?.yourScore != null"
                  (share)="result.share()" />
              }
            </div>
            <app-home-mode-entries />
          }
          @case ('done') {
            <div class="screen-enter flex flex-col gap-3" data-testid="home-v4" data-fresh="true">
              <app-home-done-card
                [score]="result.displayedTotal()"
                [rows]="result.rows()"
                [countdown]="store.countdown()"
                [betterThanPercent]="store.stats()?.betterThanPercent ?? null"
                [history]="store.stats()?.history ?? null"
                [lang]="language.current()"
                [streak]="store.pillStreak()"
                [linked]="store.linked()"
                (openStreak)="streakSheet.open()"
                [shareCopied]="result.copied()"
                [shareFailed]="result.failed()"
                [canShare]="store.canShare()"
                (share)="result.share()" />
            </div>
            <app-home-mode-entries />
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
  private readonly chrome = inject(ShellChromeStore);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);

  private readonly flagged = visibleScreen();
  /** L'écran affiché : un chargement tant que le flag n'est pas lu, et sans la V4 (la coquille renvoie alors au défi), jamais l'ancien accueil. */
  protected readonly screen = computed(() => (this.chrome.v4() ? this.flagged() : 'loading'));

  protected readonly dateLabel = computed(() => formatGameDate(todayUtc(new Date()), this.language.current(), 'weekday'));
  /** Le temps qu'il reste pour jouer le défi, dit à côté du score à battre (« plus que 6 h »). */
  protected readonly remaining = computed(() => timeLeft(secondsUntilMidnightUtc(new Date())));

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
