import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, effect, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../../core/session/session.store';
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
import { RunSounds } from '../../data-access/run-sounds';
import { RunPseudoScreenComponent } from '../../ui/run-pseudo-screen/run-pseudo-screen.component';
import { RunComparisonScreenComponent } from '../../ui/run-comparison-screen/run-comparison-screen.component';
import { RunFinishComponent } from '../../ui/run-finish/run-finish.component';
import { RunHeaderComponent } from '../../ui/run-header/run-header.component';
import { RunThemeScreenComponent } from '../../ui/run-theme-screen/run-theme-screen.component';
import { RunLinkScreenComponent } from '../../ui/run-link-screen/run-link-screen.component';
import { RunPalierComponent } from '../../ui/run-palier/run-palier.component';
import { RunDifficultyComponent } from '../../ui/run-difficulty/run-difficulty.component';
import { RunRoundCardsComponent } from '../../ui/run-round-cards/run-round-cards.component';
import { RunClockComponent } from '../../ui/run-clock/run-clock.component';
import { RunPileComponent } from '../../ui/run-pile/run-pile.component';
import { RunRevealComponent } from '../../ui/run-reveal/run-reveal.component';
import { RunStatusScreenComponent } from '../../ui/run-status-screen/run-status-screen.component';
import { RunWelcomeScreenComponent } from '../../ui/run-welcome-screen/run-welcome-screen.component';
import { RunWithdrawnCardComponent } from '../../ui/run-withdrawn-card/run-withdrawn-card.component';
import { reloadMomentFor } from '../reload-moment';

/**
 * La page du mode Run (`/setlist`, et `/setlist/<code>` pour le lien d'un ami) : elle affiche l'écran que le `RunGameStore` indique et branche ce qui est propre au navigateur : les fenêtres
 * (abandon, sortie de partie), la fermeture de l'onglet, la nouvelle version du site, le renvoi au jeu du jour sans accès sur invitation. Les stores `RunGameStore` et `TrackRoundStore` sont ceux de
 * cette page ; l'adaptateur de l'API et le lecteur sont fournis par la route.
 */
@Component({
  selector: 'app-runs-page',
  imports: [
    TranslatePipe, RouterLink, DecorBackgroundComponent, TrackRoundComponent, RunHeaderComponent, RunClockComponent, RunRevealComponent, RunPileComponent,
    RunWithdrawnCardComponent, RunFinishComponent, RunWelcomeScreenComponent, RunStatusScreenComponent, ResumeScreenComponent,
    RunLinkScreenComponent, RunThemeScreenComponent, RunPseudoScreenComponent, RunComparisonScreenComponent, RunPalierComponent, RunDifficultyComponent, RunRoundCardsComponent,
  ],
  providers: [RunGameStore, TrackRoundStore, RunShare, RunSounds],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './runs.page.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)', '(document:visibilitychange)': 'onVisibilityChange()' },
})
export class RunsPage implements OnInit {
  protected readonly store = inject(RunGameStore);
  /** La manche du morceau : sa forme et ses basses pour la réponse dans la carte. */
  protected readonly round = inject(TrackRoundStore);
  protected readonly share = inject(RunShare);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly language = inject(LanguageService);
  /** Le code de la dernière erreur serveur (`traceId`), affiché sur l'écran d'erreur comme au Daily. */
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);

  /** Le thème d'une manche de la playlist en cours, `null` pour une manche sans thème. */
  protected themeOf(round: number): string | null {
    return this.store.session()?.themes.find(t => t.round === round)?.name ?? null;
  }

  private readonly leaveGuard = new LeaveGuard(inject(ModalService));
  /** La manche en cours, dont la carte arrive à chaque nouveau morceau. */
  private readonly card = viewChild(TrackRoundComponent, { read: ElementRef<HTMLElement> });
  /** Le code du lien ouvert (`/setlist/<code>`), vide sur `/setlist`. */
  private readonly code = inject(ActivatedRoute).snapshot.paramMap.get('code');

  protected readonly chrome = inject(ShellChromeStore);

  constructor() {
    const chrome = this.chrome;
    effect(() => {
      // La barre ne reste que sur l'accueil, le lien, la fin et la comparaison : jamais au milieu d'un run.
      const screen = this.store.screen();
      chrome.setImmersive(screen === 'playing' || screen === 'theme' || screen === 'palier' || screen === 'difficulty' || screen === 'pseudo' || screen === 'resume');
    });
    inject(DestroyRef).onDestroy(() => chrome.setImmersive(false));
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
    // Sans accès sur invitation, le mode n'a pas d'écran : retour au jeu du jour, sans laisser `/setlist` dans l'historique.
    effect(() => {
      if (this.store.screen() === 'access_denied') void this.router.navigateByUrl('/daily', { replaceUrl: true });
    });
  }

  ngOnInit(): void {
    void this.store.init(this.code);
  }

  /** Le crayon de la comparaison : un invité change son pseudo ici, un compte le change dans son profil. */
  protected editPseudo(): void {
    if (this.session.player()?.isGuest) this.store.editPseudo();
    else void this.router.navigateByUrl('/account/profile');
  }

  /** Retour de l'onglet au premier plan : la partie a pu avancer ou finir dans un autre onglet (comme au Daily). */
  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void this.store.refresh();
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
