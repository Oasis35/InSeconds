import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { TrackRoundComponent } from '../../../gameplay/feature/track-round/track-round.component';
import { RoundSubmission } from '../../../gameplay/domain/track-round';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { LeaveGuard } from '../../../gameplay/feature/leave-guard';
import { ModalService } from '../../../ui/modal/modal.service';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { DailyStartup, DailyResultView, StreakSheetOpener, visibleScreen } from '../daily-shell/daily-view';
import { AbandonedScreenComponent } from '../../ui/abandoned-screen/abandoned-screen.component';
import { DayResultScreenComponent } from '../../ui/day-result-screen/day-result-screen.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DailyFooterComponent } from '../../ui/daily-footer/daily-footer.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { DailyProgressComponent } from '../../ui/daily-progress/daily-progress.component';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { ResumeScreenComponent } from '../../../gameplay/ui/resume-screen/resume-screen.component';
import { ScoreCountComponent } from '../../ui/score-count/score-count.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';
import { WelcomeScreenComponent } from '../../ui/welcome-screen/welcome-screen.component';
import { StreakPillComponent } from '../../ui/streak-pill/streak-pill.component';
import { formatGameDate } from '../../domain/archive';
import { todayUtc } from '../../../core/game-day/game-day';

/**
 * La page du défi (`/daily`) : la manche, et sans la V4 tous les écrans du jeu du jour (accueil, reprise, résultat). Elle affiche l'écran que le
 * `DailyGameStore` indique et branche ce qui est propre au navigateur : les fenêtres (abandon, sortie de partie), le compte dans le bandeau.
 * Les stores sont ceux de la coquille (`DailyShellComponent`), partagés avec l'accueil (`/`).
 */
@Component({
  selector: 'app-daily-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, BrandComponent, DailyProgressComponent, DailyFooterComponent, HomeLegalLineComponent,
    WelcomeScreenComponent, ResumeScreenComponent, StatusScreenComponent, AbandonedScreenComponent, DayResultScreenComponent,
    DeezerBadgeComponent, ScoreCountComponent, AccountLinkComponent, StreakPillComponent, ButtonComponent, InstagramLinkComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily.page.html',
})
export class DailyPage {
  protected readonly store = inject(DailyGameStore);
  protected readonly language = inject(LanguageService);
  protected readonly chrome = inject(ShellChromeStore);
  protected readonly errorReporting = inject(ErrorReportingService);
  protected readonly streakSheet = inject(StreakSheetOpener);
  protected readonly result = inject(DailyResultView);
  private readonly startup = inject(DailyStartup);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);

  private readonly leaveGuard = new LeaveGuard(inject(ModalService));

  /** La date du jour de jeu (UTC) dans la langue, en tête de l'accueil et de la reprise : « mardi 28 octobre ». */
  protected readonly dateLabel = computed(() => formatGameDate(todayUtc(new Date()), this.language.current(), 'weekday'));
  private readonly flagged = visibleScreen();
  /**
   * L'écran affiché. Sous la V4, l'accueil (`/`) montre tout sauf la manche : ici, un chargement le temps que la coquille y renvoie, jamais
   * l'ancien accueil du défi.
   */
  protected readonly screen = computed(() => {
    const screen = this.flagged();
    return this.chrome.v4() && (screen === 'welcome' || screen === 'resume_prompt' || screen === 'already_played' || screen === 'done') ? 'loading' : screen;
  });

  constructor() {
    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte (dernière réponse qui se résout, partie finie
    // ailleurs), il n'y a plus de partie à protéger : la navigation continue.
    effect(() => {
      if (this.store.screen() !== 'playing') this.leaveGuard.release();
    });
  }

  /** « Réessayer » de l'écran d'erreur. */
  protected init(): Promise<void> {
    return this.startup.run();
  }

  /** Garde de sortie : en cours de partie, une fenêtre demande confirmation. */
  isPlaying(): boolean {
    return this.store.screen() === 'playing';
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.store.screen() !== 'playing') return true;
    const data: ConfirmDialogData = {
      title: this.translate.instant('daily.leaveSheet.title'),
      body: this.translate.instant('daily.leaveSheet.body'),
      // Les rôles sont inversés à dessein : « Continuer à jouer » est l'action sûre, mise en avant.
      confirmLabel: this.translate.instant('daily.leaveSheet.confirm'),
      cancelLabel: this.translate.instant('daily.leaveSheet.cancel'),
    };
    return this.leaveGuard.confirm(data);
  }

  protected async confirmAbandon(): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('daily.abandonSheet.title'),
      body: this.translate.instant(this.store.linked() ? 'daily.abandonSheet.bodyLinked' : 'daily.abandonSheet.body'),
      confirmLabel: this.translate.instant('daily.abandonSheet.confirm'),
      cancelLabel: this.translate.instant('daily.abandonSheet.cancel'),
      tone: 'danger',
    });
    if (confirmed) await this.store.abandon();
  }

  protected onAnswered(submission: RoundSubmission): void {
    void this.store.submit(submission);
  }

  protected toggleLanguage(): void {
    this.language.use(this.language.current() === 'fr' ? 'en' : 'fr');
  }
}