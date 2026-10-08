import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, TemplateRef, afterNextRender, effect, inject, signal, untracked, viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SessionStore } from '../../core/session/session.store';
import { ErrorReportingService } from '../../core/errors/error-reporting.service';
import { LanguageService } from '../../core/i18n/language.service';
import { HeaderSlot } from '../../core/shell/app-header/header-slot';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { TrackRoundComponent } from '../../gameplay/feature/track-round.component';
import { RoundSubmission } from '../../gameplay/domain/track-round';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../ui/modal/confirm-dialog.component';
import { ModalService } from '../../ui/modal/modal.service';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';
import { DailyGameStore } from '../data-access/daily-game.store';
import { DailyShare } from '../data-access/daily-share';
import { AlreadyPlayedScreenComponent } from '../ui/already-played-screen/already-played-screen.component';
import { DailyBrandComponent } from '../ui/daily-brand/daily-brand.component';
import { DailyFooterComponent } from '../ui/daily-footer/daily-footer.component';
import { DailyProgressComponent } from '../ui/daily-progress/daily-progress.component';
import { DeezerBadgeComponent } from '../ui/deezer-badge/deezer-badge.component';
import { FinalRecapScreenComponent } from '../ui/final-recap-screen/final-recap-screen.component';
import { GelEarnedToastComponent } from '../ui/gel-earned-toast/gel-earned-toast.component';
import { GelUsedToastComponent } from '../ui/gel-used-toast/gel-used-toast.component';
import { GuestStreakToastComponent } from '../ui/guest-streak-toast/guest-streak-toast.component';
import { LostStreakToastComponent } from '../ui/lost-streak-toast/lost-streak-toast.component';
import { ResumeScreenComponent } from '../ui/resume-screen/resume-screen.component';
import { ScoreCountComponent } from '../ui/score-count/score-count.component';
import { countUp } from '../ui/score-count/count-up';
import { StatusScreenComponent } from '../ui/status-screen/status-screen.component';
import { StreakPillComponent } from '../ui/streak-pill/streak-pill.component';
import { StreakSheetComponent, StreakSheetData, StreakSheetResult } from '../ui/streak-sheet/streak-sheet.component';
import { WelcomeScreenComponent } from '../ui/welcome-screen/welcome-screen.component';

/**
 * La page du jeu du jour (`/daily`) : elle affiche l'écran que le `DailyGameStore` indique, et branche ce qui est propre au navigateur :
 * la gélule de série dans l'en-tête, les fenêtres (abandon, sortie de partie, panneau de série), le retour de l'onglet au premier plan, la
 * fermeture de l'onglet, le partage. Les stores `DailyGameStore` et `TrackRoundStore` sont ceux de cette page.
 */
@Component({
  selector: 'app-daily-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, DailyBrandComponent, DailyProgressComponent, DailyFooterComponent,
    WelcomeScreenComponent, ResumeScreenComponent, StatusScreenComponent, AlreadyPlayedScreenComponent, FinalRecapScreenComponent,
    StreakPillComponent, GuestStreakToastComponent, LostStreakToastComponent, GelUsedToastComponent, GelEarnedToastComponent,
    DeezerBadgeComponent, ScoreCountComponent,
  ],
  providers: [DailyGameStore, TrackRoundStore, DailyShare],
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
  private readonly headerSlot = inject(HeaderSlot);
  private readonly dailyShare = inject(DailyShare);
  private readonly destroyRef = inject(DestroyRef);

  private readonly headerLeft = viewChild<TemplateRef<unknown>>('headerLeft');
  private leaveDialog: DialogRef<boolean, ConfirmDialogComponent> | null = null;

  protected readonly shareCopied = this.dailyShare.copied;
  protected readonly shareFailed = this.dailyShare.failed;
  /** Le score final qui monte de 0 à sa valeur (récap). */
  protected readonly displayedTotal = signal(0);
  protected readonly isEnglish = () => this.language.current() === 'en';

  constructor() {
    // L'emplacement de gauche de l'en-tête est à cette page tant qu'elle est affichée.
    afterNextRender(() => {
      const template = this.headerLeft();
      if (template) this.headerSlot.show(template);
    });
    this.destroyRef.onDestroy(() => {
      const template = this.headerLeft();
      if (template) this.headerSlot.clear(template);
    });

    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte (dernière réponse qui se résout, partie finie
    // ailleurs), il n'y a plus de partie à protéger : la navigation continue.
    effect(() => {
      if (this.store.screen() !== 'playing' && this.leaveDialog) this.leaveDialog.close(true);
    });

    // Le score final monte de 0 à sa valeur en entrant dans le récap.
    effect(() => {
      if (this.store.screen() !== 'done') return;
      const total = untracked(() => this.store.totalScore());
      this.displayedTotal.set(0);
      countUp(total, v => this.displayedTotal.set(v), 1000);
    });
  }

  ngOnInit(): void {
    void this.store.init();
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
    this.leaveDialog?.close(false);
    const dialog = this.modal.openSheet<boolean, ConfirmDialogData, ConfirmDialogComponent>(ConfirmDialogComponent, { data });
    this.leaveDialog = dialog;
    return new Promise<boolean>(resolve =>
      dialog.closed.subscribe(result => {
        if (this.leaveDialog === dialog) this.leaveDialog = null;
        resolve(result === true);
      }));
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
    const data: StreakSheetData = { streak: this.store.sheetStreak(), linked: this.store.linked(), lang: this.language.current() };
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

  /** Copie le résumé de la partie : un `✅/❌` par morceau, le score et le lien. */
  protected share(): void {
    const stats = this.store.stats();
    const done = this.store.screen() === 'done';
    const tracks = done
      ? this.store.results().map(r => ({ artistCorrect: r.artistCorrect, titleCorrect: r.titleCorrect, listenedSeconds: r.listenedSeconds }))
      : (stats?.tracks ?? [])
          .filter(t => t.listenedSeconds !== null)
          .map(t => ({ artistCorrect: t.artistCorrect === true, titleCorrect: t.titleCorrect === true, listenedSeconds: t.listenedSeconds ?? 0 }));
    void this.dailyShare.share(tracks, done ? this.store.totalScore() : (stats?.yourScore ?? 0));
  }
}
