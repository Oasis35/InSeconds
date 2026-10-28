import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../core/session/session.store';
import { VersionService } from '../../core/version/version.service';
import { ErrorReportingService } from '../../core/errors/error-reporting.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AccountLinkComponent } from '../../core/shell/account-link/account-link.component';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { TrackRoundComponent } from '../../gameplay/feature/track-round.component';
import { RoundSubmission } from '../../gameplay/domain/track-round';
import { ConfirmDialogData } from '../../ui/modal/confirm-dialog.component';
import { LeaveGuard } from '../../gameplay/feature/leave-guard';
import { ModalService } from '../../ui/modal/modal.service';
import { ToastService } from '../../ui/toast/toast.service';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';
import { DailyGameStore } from '../data-access/daily-game.store';
import { DailyShare } from '../data-access/daily-share';
import { GuestStreakNotice } from '../data-access/guest-streak-notice';
import { LostStreakNotice } from '../data-access/lost-streak-notice';
import { ThanksNotice } from '../data-access/thanks-notice';
import { AbandonedScreenComponent } from '../ui/abandoned-screen/abandoned-screen.component';
import { DayResultScreenComponent } from '../ui/day-result-screen/day-result-screen.component';
import { rowsFromResults, rowsFromStats } from '../ui/day-result-screen/result-rows';
import { BrandComponent } from '../../gameplay/ui/brand/brand.component';
import { DailyFooterComponent } from '../ui/daily-footer/daily-footer.component';
import { DailyProgressComponent } from '../ui/daily-progress/daily-progress.component';
import { DeezerBadgeComponent } from '../../gameplay/ui/deezer-badge/deezer-badge.component';
import { GelEarnedToastComponent } from '../ui/gel-earned-toast/gel-earned-toast.component';
import { GelUsedToastComponent } from '../ui/gel-used-toast/gel-used-toast.component';
import { GuestStreakToastComponent } from '../ui/guest-streak-toast/guest-streak-toast.component';
import { LostStreakToastComponent } from '../ui/lost-streak-toast/lost-streak-toast.component';
import { ResumeScreenComponent } from '../../gameplay/ui/resume-screen/resume-screen.component';
import { HomeModeEntriesComponent } from '../../core/shell/home-mode-entries/home-mode-entries.component';
import { ScoreCountComponent } from '../ui/score-count/score-count.component';
import { countUp } from '../ui/score-count/count-up';
import { StatusScreenComponent } from '../ui/status-screen/status-screen.component';
import { StreakSheetComponent, StreakSheetData, StreakSheetResult } from '../ui/streak-sheet/streak-sheet.component';
import { ThanksDialogComponent, ThanksDialogData } from '../ui/thanks-dialog/thanks-dialog.component';
import { WelcomeScreenComponent } from '../ui/welcome-screen/welcome-screen.component';
import { reloadMomentFor } from './reload-moment';

/** Le message de remerciement s'ouvre après la montée du score final (1 s) juste après la partie, un peu plus tôt aux visites suivantes. */
const THANKS_DELAY_AFTER_GAME_MS = 1500;
const THANKS_DELAY_MS = 800;

type ThanksScreen = 'done' | 'already_played';

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
    DeezerBadgeComponent, ScoreCountComponent, AccountLinkComponent,
  ],
  providers: [DailyGameStore, TrackRoundStore, DailyShare, ThanksNotice, LostStreakNotice, GuestStreakNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily.page.html',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class DailyPage implements OnInit {
  protected readonly store = inject(DailyGameStore);
  protected readonly session = inject(SessionStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly round = inject(TrackRoundStore);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly dailyShare = inject(DailyShare);
  private readonly thanks = inject(ThanksNotice);
  private readonly lostStreakNotice = inject(LostStreakNotice);
  private readonly guestStreakNotice = inject(GuestStreakNotice);
  private readonly toasts = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly leaveGuard = new LeaveGuard(inject(ModalService));
  /** Le message de remerciement est en attente d'ouverture ou ouvert : jamais deux fois sur la même page. */
  private thanksOffered = false;
  private destroyed = false;

  protected readonly shareCopied = this.dailyShare.copied;
  protected readonly shareFailed = this.dailyShare.failed;
  /** Le score final qui monte de 0 à sa valeur juste après la partie. */
  protected readonly displayedTotal = signal(0);
  /** Les morceaux du résultat du jour : les réponses de la partie qui vient de finir, sinon celles relues dans les stats. */
  protected readonly resultRows = computed(() =>
    this.store.screen() === 'done' ? rowsFromResults(this.store.results(), this.store.stats()) : rowsFromStats(this.store.stats()));
  protected readonly isEnglish = () => this.language.current() === 'en';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });

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

    // Le message de remerciement, une fois par navigateur : sur le résultat du jour (juste après la partie ou plus tard), jamais en pleine manche.
    effect(() => {
      const screen = this.store.screen();
      if (screen === 'done' || screen === 'already_played') untracked(() => void this.offerThanks(screen));
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

  private async offerThanks(screen: ThanksScreen): Promise<void> {
    if (this.thanksOffered || !this.thanks.isDue()) return;
    this.thanksOffered = true;
    const delayMs = screen === 'done' ? THANKS_DELAY_AFTER_GAME_MS : THANKS_DELAY_MS;
    const [games] = await Promise.all([this.thanks.gamesPlayed(), new Promise(resolve => setTimeout(resolve, delayMs))]);
    // Le joueur a quitté l'écran entre-temps (nouvelle partie, autre page) : le message attendra la prochaine fin de partie.
    if (this.destroyed || this.store.screen() !== screen) {
      this.thanksOffered = false;
      return;
    }
    this.thanks.markSeen();
    const data: ThanksDialogData = { games, lang: this.language.current(), challenge: () => void this.challengeFriend() };
    this.modal.openSheet<void, ThanksDialogData, ThanksDialogComponent>(ThanksDialogComponent, { data });
  }

  private async challengeFriend(): Promise<void> {
    const outcome = await this.thanks.challengeFriend();
    if (outcome === 'copied') this.toasts.show('daily.thanks.copied', { tone: 'success' });
    else if (outcome === 'failed') this.toasts.show('daily.thanks.copyFailed', { tone: 'error' });
  }

  /** Partage le résumé de la partie (menu du téléphone, sinon presse-papier) : un `✅`, `🔶` ou `🅾️` par morceau, le score et le lien. */
  protected share(): void {
    const stats = this.store.stats();
    const done = this.store.screen() === 'done';
    const tracks = done
      ? this.store.results().map(r => ({ artistCorrect: r.artistCorrect, titleCorrect: r.titleCorrect }))
      : (stats?.tracks ?? [])
          .filter(t => t.listenedSeconds !== null)
          .map(t => ({ artistCorrect: t.artistCorrect === true, titleCorrect: t.titleCorrect === true }));
    void this.dailyShare.share(tracks, done ? this.store.totalScore() : (stats?.yourScore ?? 0));
  }
}
