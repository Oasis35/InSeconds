import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VersionService } from '../../../core/version/version.service';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
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
import { HomeChallengeCardComponent } from '../../ui/home-challenge-card/home-challenge-card.component';
import { HomeDoneCardComponent } from '../../ui/home-done-card/home-done-card.component';
import { AbandonedScreenComponent } from '../../ui/abandoned-screen/abandoned-screen.component';
import { DayResultScreenComponent } from '../../ui/day-result-screen/day-result-screen.component';
import { rowsFromResults, rowsFromStats, shareTracksOf } from '../../ui/day-result-screen/result-rows';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DailyFooterComponent } from '../../ui/daily-footer/daily-footer.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
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
import { secondsUntilMidnightUtc, timeLeft, todayUtc } from '../../../core/game-day/game-day';

/**
 * La page du jeu du jour (`/daily`) : elle affiche l'écran que le `DailyGameStore` indique, et branche ce qui est propre au navigateur :
 * la gélule de série et le lien de compte dans le bandeau, les fenêtres (abandon, sortie de partie, panneau de série), le retour de l'onglet
 * au premier plan, la fermeture de l'onglet, le partage. Les stores `DailyGameStore` et `TrackRoundStore` sont ceux de cette page.
 */
@Component({
  selector: 'app-daily-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, BrandComponent, DailyProgressComponent, DailyFooterComponent, HomeLegalLineComponent,
    WelcomeScreenComponent, ResumeScreenComponent, HomeModeEntriesComponent, StatusScreenComponent, AbandonedScreenComponent, DayResultScreenComponent,
    GuestStreakToastComponent, LostStreakToastComponent, GelUsedToastComponent, GelEarnedToastComponent,
    DeezerBadgeComponent, ScoreCountComponent, AccountLinkComponent, StreakPillComponent, ButtonComponent, InstagramLinkComponent,
    HomeChallengeCardComponent, HomeDoneCardComponent,
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
  protected readonly chrome = inject(ShellChromeStore);
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
  /** V4 : le temps qu'il reste pour jouer le défi, dit à côté du score à battre (« plus que 6 h »). */
  protected readonly remaining = computed(() => timeLeft(secondsUntilMidnightUtc(new Date())));
  /** V4, défi fait : l'accueil montre son résumé, « Voir le résultat » ouvre l'écran complet (`?view=result`, le retour ramène à l'accueil). */
  protected readonly showResult = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(params => params.get('view') === 'result')), { initialValue: false });
  protected readonly isEnglish = () => this.language.current() === 'en';
  /** Cette page sert la racine (l'accueil, avec la carte Setlist) comme `/daily` (le défi seul) : l'adresse dit laquelle. */
  private readonly path = toSignal(
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(() => this.router.url.split(/[?#]/)[0])),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );
  protected readonly isHome = computed(() => this.path() === '/');

  constructor() {
    // La coque (barre du bas de la V4) sait si une manche est en cours et si le défi du jour est joué.
    effect(() => {
      const screen = this.store.screen();
      this.chrome.setImmersive(screen === 'playing');
      let done: boolean | null = null;
      if (screen === 'welcome' || screen === 'resume_prompt') done = false;
      else if (screen === 'already_played' || screen === 'done') done = true;
      this.chrome.setDailyDone(done);
    });
    this.destroyRef.onDestroy(() => this.chrome.setImmersive(false));
    // Sans l'accès Setlist, la racine n'a pas d'accueil à part : c'est le défi. Une partie qui commence passe aussi sur `/daily`.
    effect(() => {
      if (!this.isHome()) return;
      const screen = this.store.screen();
      const noHome = this.chrome.v4Known() && !this.chrome.v4();
      if (noHome || screen === 'playing') {
        void this.router.navigate(['/daily'], { queryParamsHandling: 'preserve', replaceUrl: true });
      }
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

  protected openResult(): void {
    void this.router.navigate(['/daily'], { queryParams: { view: 'result' }, queryParamsHandling: 'merge' });
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

  /**
   * Partage le résumé de la partie (menu du téléphone, sinon presse-papier) : une ligne par morceau, avec le palier écouté, les mêmes morceaux,
   * dans le même ordre, que la liste du résultat du jour.
   */
  protected share(): void {
    const score = this.store.screen() === 'done' ? this.store.totalScore() : (this.store.stats()?.yourScore ?? 0);
    void this.dailyShare.share(shareTracksOf(this.resultRows()), score, formatSeconds);
  }
}
