import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorReportingService } from '../../core/errors/error-reporting.service';
import { LanguageService } from '../../core/i18n/language.service';
import { VersionService } from '../../core/version/version.service';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { TrackRoundComponent } from '../../gameplay/feature/track-round.component';
import { RoundSubmission } from '../../gameplay/domain/track-round';
import { ConfirmDialogData } from '../../ui/modal/confirm-dialog.component';
import { LeaveGuard } from '../../gameplay/feature/leave-guard';
import { ModalService } from '../../ui/modal/modal.service';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';
import { RunGameStore } from '../data-access/run-game.store';
import { RunAnswerCardComponent } from '../ui/run-answer-card/run-answer-card.component';
import { RunHeaderComponent } from '../ui/run-header/run-header.component';
import { RunObjectiveComponent } from '../ui/run-objective/run-objective.component';
import { RunPillsComponent } from '../ui/run-pills/run-pills.component';
import { RunStatusScreenComponent } from '../ui/run-status-screen/run-status-screen.component';
import { RunWelcomeScreenComponent } from '../ui/run-welcome-screen/run-welcome-screen.component';
import { reloadMomentFor } from './reload-moment';

/**
 * La page du mode Run (`/runs`) : elle affiche l'écran que le `RunGameStore` indique et branche ce qui est propre au navigateur : les fenêtres
 * (abandon, sortie de partie), la fermeture de l'onglet, la nouvelle version du site, le renvoi au jeu du jour sans accès sur invitation. Les stores `RunGameStore` et `TrackRoundStore` sont ceux de
 * cette page ; l'adaptateur de l'API et le lecteur sont fournis par la route.
 */
@Component({
  selector: 'app-runs-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, RunHeaderComponent, RunObjectiveComponent, RunPillsComponent,
    RunAnswerCardComponent, RunWelcomeScreenComponent, RunStatusScreenComponent,
  ],
  providers: [RunGameStore, TrackRoundStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './runs.page.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class RunsPage implements OnInit {
  protected readonly store = inject(RunGameStore);
  protected readonly language = inject(LanguageService);
  /** Le code de la dernière erreur serveur (`traceId`), affiché sur l'écran d'erreur comme au Daily. */
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly leaveGuard = new LeaveGuard(inject(ModalService));

  constructor() {
    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => reloadMomentFor(this.store.screen()), inject(DestroyRef));
    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte, il n'y a plus de manche à protéger : la navigation continue.
    effect(() => {
      if (this.store.screen() !== 'playing') this.leaveGuard.release();
    });
    // Sans accès sur invitation, le mode n'a pas d'écran : retour au jeu du jour, sans laisser `/runs` dans l'historique.
    const router = inject(Router);
    effect(() => {
      if (this.store.screen() === 'access_denied') void router.navigateByUrl('/daily', { replaceUrl: true });
    });
  }

  ngOnInit(): void {
    void this.store.init();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.screen() === 'playing') event.preventDefault();
  }

  /** Garde de sortie : en pleine manche, une fenêtre demande confirmation (la partie reste reprenable). */
  canLeave(): boolean | Promise<boolean> {
    if (this.store.screen() !== 'playing') return true;
    const data: ConfirmDialogData = {
      title: this.translate.instant('runs.leave.title'),
      body: this.translate.instant('runs.leave.body'),
      // Confirmer (`true`) laisse partir : « Quitter quand même ». « Continuer à jouer » est l'annulation, qui a le focus (comme au Daily).
      confirmLabel: this.translate.instant('runs.leave.confirm'),
      cancelLabel: this.translate.instant('runs.leave.cancel'),
    };
    return this.leaveGuard.confirm(data);
  }

  protected async confirmAbandon(): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('runs.abandon.title'),
      body: this.translate.instant('runs.abandon.body'),
      confirmLabel: this.translate.instant('runs.abandon.confirm'),
      cancelLabel: this.translate.instant('runs.abandon.cancel'),
      tone: 'danger',
    });
    if (confirmed) await this.store.abandon();
  }

  protected onAnswered(submission: RoundSubmission): void {
    void this.store.submit(submission);
  }
}
