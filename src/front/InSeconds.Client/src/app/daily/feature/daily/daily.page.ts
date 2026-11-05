import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VersionService } from '../../../core/version/version.service';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { TrackRoundStore } from '../../../gameplay/data-access/track-round.store';
import { TrackRoundComponent } from '../../../gameplay/feature/track-round/track-round.component';
import { RoundSubmission } from '../../../gameplay/domain/track-round';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { LeaveGuard } from '../../../gameplay/feature/leave-guard';
import { ModalService } from '../../../ui/modal/modal.service';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { formatSeconds } from '../../../ui/format/format-seconds';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { DailyShare } from '../../data-access/daily-share';
import { GuestStreakNotice } from '../../data-access/guest-streak-notice';
import { LostStreakNotice } from '../../data-access/lost-streak-notice';
import { AbandonedScreenComponent } from '../../ui/abandoned-screen/abandoned-screen.component';
import { DayResultScreenComponent } from '../../ui/day-result-screen/day-result-screen.component';
import { rowsFromResults, rowsFromStats } from '../../ui/day-result-screen/result-rows';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { DailyFooterComponent } from '../../ui/daily-footer/daily-footer.component';
import { DailyProgressComponent } from '../../ui/daily-progress/daily-progress.component';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { GelEarnedToastComponent } from '../../ui/gel-earned-toast/gel-earned-toast.component';
import { GelUsedToastComponent } from '../../ui/gel-used-toast/gel-used-toast.component';
import { GuestStreakToastComponent } from '../../ui/guest-streak-toast/guest-streak-toast.component';
import { LostStreakToastComponent } from '../../ui/lost-streak-toast/lost-streak-toast.component';
import { ResumeScreenComponent } from '../../../gameplay/ui/resume-screen/resume-screen.component';
import { HomeModeEntriesComponent } from '../../../core/shell/home-mode-entries/home-mode-entries.component';
import { ScoreCountComponent } from '../../ui/score-count/score-count.component';
import { countUp } from '../../ui/score-count/count-up';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';
import { StreakSheetComponent, StreakSheetData, StreakSheetResult } from '../../ui/streak-sheet/streak-sheet.component';
import { WelcomeScreenComponent } from '../../ui/welcome-screen/welcome-screen.component';
import { reloadMomentFor } from '../reload-moment';
import { StreakPillComponent } from '../../ui/streak-pill/streak-pill.component';
import { formatGameDate } from '../../domain/archive';
import { todayUtc } from '../../domain/countdown';

/**
 * La page du jeu du jour (`/daily`) : elle affiche l'écran que le `DailyGameStore` indique, et branche ce qui est propre au navigateur :
 * la gélule de série et le lien de compte dans le bandeau, les fenêtres (abandon, sortie de partie, panneau de série), le retour de l'onglet
 * au premier plan, la fermeture de l'onglet, le partage. Les stores `DailyGameStore` et `TrackRoundStore` sont ceux de cette page.
 */
@Component({
  selector: 'app-daily-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, BrandComponent, DailyProgressComponent, DailyFooterComponent,
    WelcomeScreenComponent, ResumeScreenComponent, HomeModeEntriesComponent, StatusScreenComponent, AbandonedScreenComponent, DayResultScreenComponent,
    GuestStreakToastComponent, LostStreakToastComponent, GelUsedToastComponent, GelEarnedToastComponent,
    DeezerBadgeComponent, ScoreCountComponent, AccountLinkComponent, StreakPillComponent, ButtonComponent,
  ],
  providers: [DailyGameStore, TrackRoundStore, DailyShare, LostStreakNotice, GuestStreakNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily.page.html',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class DailyPage implements OnInit {
  protected readonly store = inject(DailyGameStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly round = inject(TrackRoundStore);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly dailyShare = inject(DailyShare);
  private readonly lostStreakNotice = inject(LostStreakNotice);
  private readonly guestStreakNotice = inject(GuestStreakNotice);
  private readonly destroyRef = inject(DestroyRef);

  private readonly leaveGuard = new LeaveGuard(inject(ModalService));

  protected readonly shareCopied = this.dailyShare.copied;
  protected readonly shareFailed = this.dailyShare.failed;
  /** Le score final qui monte de 0 à sa valeur juste après la partie. */
  protected readonly displayedTotal = signal(0);
  /** Les morceaux du résultat du jour : les réponses de la partie qui vient de finir, sinon celles relues dans les stats. */
  protected readonly resultRows = computed(() =>
    this.store.screen() === 'done' ? rowsFromResults(this.store.results(), this.store.stats()) : rowsFromStats(this.store.stats()));
  /** La date du jour de jeu (UTC) dans la langue, en tête de l'accueil et de la reprise : « mardi 28 octobre ». */
  protected readonly dateLabel = computed(() => formatGameDate(todayUtc(new Date()), this.language.current(), 'weekday'));
  protected readonly isEnglish = () => this.language.current() === 'en';

  constructor() {
    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => reloadMomentFor(this.store.screen()), this.destroyRef);

    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte (dernière réponse qui se résout, partie finie
    // ailleurs), il n'y a plus de partie à protéger : la navigation continue.
    effect(() => {
      if (this.store.screen() !== 'playing') this.leaveGuard.release();
    });

    // Le score final monte de 0 à sa valeur juste après la partie.
    effect(() => {
      if (this.store.screen() !== 'done') return;
      const total = untracked(() => this.store.totalScore());
      this.displayedTotal.set(0);
      countUp(total, v => this.displayedTotal.set(v), 1000);
    });
  }

  ngOnInit(): void {
    void this.init();
  }

  /** Premier chargement, ou « Réessayer » de l'écran d'erreur : l'état du jour, puis le toast invité « série perdue » s'il est dû. */
  protected async init(): Promise<void> {
    this.store.restoreStreakToastDismissal(this.guestStreakNotice.dismissedAt());
    await this.store.init();
    const streak = this.store.today()?.streak;
    const lost = streak ? this.lostStreakNotice.take(streak) : null;
    if (lost !== null) this.store.announceLostStreak(lost);
  }

  /** Le bandeau « crée un compte » fermé par un invité ne revient pas d'une visite à l'autre (règles dans `domain/toasts`). */
  protected dismissGuestStreakToast(): void {
    this.guestStreakNotice.remember(this.store.dismissStreakToast());
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible') this.store.refresh();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.screen() === 'playing') event.preventDefault();
  }

  /** Garde de sortie : en cours de partie, une fenêtre demande confirmation. */
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

  protected openStreakSheet(): void {
    const data: StreakSheetData = {
      streak: this.store.sheetStreak(), linked: this.store.linked(), gamesPlayed: this.store.sheetGamesPlayed(), lang: this.language.current(),
    };
    const dialog = this.modal.openSheet<StreakSheetResult, StreakSheetData, StreakSheetComponent>(StreakSheetComponent, { data });
    dialog.closed.subscribe(result => {
      if (result === 'playNow') this.store.playNow();
      else if (result === 'signup') void this.router.navigate(['/account/login']);
    });
  }

  protected onAnswered(submission: RoundSubmission): void {
    void this.store.submit(submission);
  }

  protected toggleLanguage(): void {
    this.language.use(this.language.current() === 'fr' ? 'en' : 'fr');
  }

  /** Partage le résumé de la partie (menu du téléphone, sinon presse-papier) : le score, puis par morceau `✅`/`❌` et le palier écouté, et le lien. */
  protected share(): void {
    // Les mêmes morceaux, dans le même ordre, que la liste du résultat du jour ; un morceau sans réponse n'a pas de ligne.
    const tracks = this.resultRows().flatMap(r => r.listenedSeconds === null
      ? []
      : [{ artistCorrect: r.artistCorrect === true, titleCorrect: r.titleCorrect === true, listenedSeconds: r.listenedSeconds }]);
    const score = this.store.screen() === 'done' ? this.store.totalScore() : (this.store.stats()?.yourScore ?? 0);
    void this.dailyShare.share(tracks, score, formatSeconds);
  }
}
