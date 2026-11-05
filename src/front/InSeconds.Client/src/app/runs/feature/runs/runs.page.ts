import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, effect, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { VersionService } from '../../../core/version/version.service';
import { TrackRoundStore } from '../../../gameplay/data-access/track-round.store';
import { TrackRoundComponent } from '../../../gameplay/feature/track-round/track-round.component';
import { RoundSubmission } from '../../../gameplay/domain/track-round';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { LeaveGuard } from '../../../gameplay/feature/leave-guard';
import { ModalService } from '../../../ui/modal/modal.service';
import { enterCard } from '../../../ui/motion/motion';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ResumeScreenComponent } from '../../../gameplay/ui/resume-screen/resume-screen.component';
import { RunGameStore } from '../../data-access/run-game.store';
import { RunShare } from '../../data-access/run-share';
import { RunTick } from '../../data-access/run-tick';
import { RunComparisonScreenComponent } from '../../ui/run-comparison-screen/run-comparison-screen.component';
import { RunFinishComponent } from '../../ui/run-finish/run-finish.component';
import { RunHeaderComponent } from '../../ui/run-header/run-header.component';
import { RunLinkScreenComponent } from '../../ui/run-link-screen/run-link-screen.component';
import { RunPalierComponent } from '../../ui/run-palier/run-palier.component';
import { RunDifficultyComponent } from '../../ui/run-difficulty/run-difficulty.component';
import { RunClockComponent } from '../../ui/run-clock/run-clock.component';
import { RunPileComponent } from '../../ui/run-pile/run-pile.component';
import { RunRevealComponent } from '../../ui/run-reveal/run-reveal.component';
import { RunStatusScreenComponent } from '../../ui/run-status-screen/run-status-screen.component';
import { RunWelcomeScreenComponent } from '../../ui/run-welcome-screen/run-welcome-screen.component';
import { RunWithdrawnCardComponent } from '../../ui/run-withdrawn-card/run-withdrawn-card.component';
import { reloadMomentFor } from '../reload-moment';

/**
 * La page du mode Run (`/runs`, et `/runs/<code>` pour le lien d'un ami) : elle affiche l'écran que le `RunGameStore` indique et branche ce qui est propre au navigateur : les fenêtres
 * (abandon, sortie de partie), la fermeture de l'onglet, la nouvelle version du site, le renvoi au jeu du jour sans accès sur invitation. Les stores `RunGameStore` et `TrackRoundStore` sont ceux de
 * cette page ; l'adaptateur de l'API et le lecteur sont fournis par la route.
 */
@Component({
  selector: 'app-runs-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, RunHeaderComponent, RunClockComponent, RunRevealComponent, RunPileComponent,
    RunWithdrawnCardComponent, RunFinishComponent, RunWelcomeScreenComponent, RunStatusScreenComponent, ResumeScreenComponent,
    RunLinkScreenComponent, RunComparisonScreenComponent, RunPalierComponent, RunDifficultyComponent,
  ],
  providers: [RunGameStore, TrackRoundStore, RunShare, RunTick],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './runs.page.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class RunsPage implements OnInit {
  protected readonly store = inject(RunGameStore);
  /** La manche du morceau : sa forme et ses basses pour la réponse dans la carte. */
  protected readonly round = inject(TrackRoundStore);
  protected readonly share = inject(RunShare);
  protected readonly language = inject(LanguageService);
  /** Le code de la dernière erreur serveur (`traceId`), affiché sur l'écran d'erreur comme au Daily. */
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly leaveGuard = new LeaveGuard(inject(ModalService));
  /** La manche en cours, dont la carte arrive à chaque nouveau morceau. */
  private readonly card = viewChild(TrackRoundComponent, { read: ElementRef<HTMLElement> });
  /** Le code du lien ouvert (`/runs/<code>`), vide sur `/runs`. */
  private readonly code = inject(ActivatedRoute).snapshot.paramMap.get('code');

  constructor() {
    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => reloadMomentFor(this.store.screen()), inject(DestroyRef));
    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte, il n'y a plus de manche à protéger : la navigation continue.
    effect(() => {
      if (this.store.screen() !== 'playing') this.leaveGuard.release();
    });
    // En mouvement réduit (et dans les tests de bout en bout), la partie ne s'enchaîne pas seule : le joueur clique.
    this.store.setAutoAdvance(!motionReduced());
    // Chaque nouveau morceau fait arriver sa carte (la pile a déjà pris la précédente).
    const injector = inject(Injector);
    effect(() => {
      if (this.round.trackId() === null) return;
      afterNextRender(() => {
        // La carte est le premier élément de la manche (son cadre en disposition `inline`).
        const card = this.card()?.nativeElement.firstElementChild;
        if (card instanceof HTMLElement) enterCard(card);
      }, { injector });
    });
    // Sans accès sur invitation, le mode n'a pas d'écran : retour au jeu du jour, sans laisser `/runs` dans l'historique.
    const router = inject(Router);
    effect(() => {
      if (this.store.screen() === 'access_denied') void router.navigateByUrl('/daily', { replaceUrl: true });
    });
  }

  ngOnInit(): void {
    void this.store.init(this.code);
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
