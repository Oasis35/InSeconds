import { Component, inject, signal, effect, viewChild, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { ErrorReportingService } from '../../core/services/error-reporting.service';
import { GameFacadeService } from './services/game-facade.service';
import { GameShareService } from './services/game-share.service';
import { LeaveConfirmationService } from './services/leave-confirmation.service';
import { GameStore } from './game.store';
import { BlindRoundComponent, AnsweredEvent } from './blind-round/blind-round.component';
import { ConfirmSheetComponent } from '../../shared/confirm-sheet/confirm-sheet.component';
import { UnsavedGameComponent } from '../../core/guards/unsaved-game.guard';
import { TranslatePipe } from '@ngx-translate/core';
import { WelcomeScreenComponent } from './screens/welcome-screen/welcome-screen.component';
import { ResumeScreenComponent } from './screens/resume-screen/resume-screen.component';
import { StatusScreenComponent } from './screens/status-screen/status-screen.component';
import { AlreadyPlayedScreenComponent } from './screens/already-played-screen/already-played-screen.component';
import { FinalRecapScreenComponent } from './screens/final-recap-screen/final-recap-screen.component';
import { GameHeaderComponent } from './components/game-header/game-header.component';
import { GameFooterComponent } from './components/game-footer/game-footer.component';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';
import { StreakSheetComponent } from '../../shared/streak-sheet/streak-sheet.component';
import { StreakIconComponent } from '../../shared/streak-icon/streak-icon.component';
import { FreezeCellsComponent } from '../../shared/freeze-cells/freeze-cells.component';

@Component({
  selector: 'app-game',
  imports: [
    BlindRoundComponent, ConfirmSheetComponent, TranslatePipe, RouterLink,
    WelcomeScreenComponent, ResumeScreenComponent, StatusScreenComponent,
    AlreadyPlayedScreenComponent, FinalRecapScreenComponent,
    GameHeaderComponent, GameFooterComponent, DecorBackgroundComponent,
    StreakSheetComponent, StreakIconComponent, FreezeCellsComponent, NgTemplateOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game.component.html',
  providers: [GameStore, GameFacadeService, GameShareService, LeaveConfirmationService],
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class GameComponent implements OnInit, UnsavedGameComponent {
  protected readonly store = inject(GameStore);
  private readonly gameShare = inject(GameShareService);
  private readonly leaveConfirmation = inject(LeaveConfirmationService);
  protected readonly playerSession = inject(PlayerSessionService);
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly showStreakSheet = signal(false);
  protected readonly showLeaveConfirm = this.leaveConfirmation.showLeaveConfirm;
  protected readonly shareCopied = this.gameShare.copied;
  protected readonly shareFailed = this.gameShare.failed;

  protected readonly roundRef = viewChild<BlindRoundComponent>('roundRef');

  constructor() {
    // Si la partie quitte l'état 'playing' (terminée/abandonnée en arrière-plan, ex. dernière
    // réponse HTTP qui se résout) pendant qu'une confirmation de sortie est ouverte, on laisse
    // la navigation se faire — il n'y a plus de partie à protéger.
    effect(() => {
      if (this.store.state() !== 'playing' && this.leaveConfirmation.hasPending) {
        this.leaveConfirmation.resolve(true);
      }
    });
  }

  ngOnInit(): void {
    this.store.init();
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible') this.store.refresh();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.state() === 'playing') event.preventDefault();
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.store.state() !== 'playing') return true;
    return this.leaveConfirmation.request();
  }

  protected confirmLeave(): void {
    this.leaveConfirmation.confirm();
  }

  protected cancelLeave(): void {
    this.leaveConfirmation.cancel();
  }

  protected onAnswered(event: AnsweredEvent): void {
    this.store.submitAnswer(event).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => this.roundRef()?.setResult(response),
      // Échec définitif : le joueur reste sur ce morceau avec un bouton « Réessayer » (piège 32).
      error: () => this.roundRef()?.setSubmitError(),
    });
  }

  protected shareFromStats(): void {
    const stats = this.store.todayStats();
    if (stats) this.gameShare.shareStats(stats);
  }

  protected share(): void {
    this.gameShare.shareResults(this.store.results(), this.store.totalScore());
  }

  // ── Panneau série / gel ──────────────────────────────────────────────────

  protected openStreakSheet(): void {
    this.showStreakSheet.set(true);
  }

  protected closeStreakSheet(): void {
    this.showStreakSheet.set(false);
  }

  /** « Jouer maintenant » (série protégée) : lance ou reprend la partie du jour. */
  protected playFromStreakSheet(): void {
    this.showStreakSheet.set(false);
    this.store.playNow();
  }

  protected signupFromStreakSheet(): void {
    this.showStreakSheet.set(false);
    this.router.navigate(['/login']);
  }
}
