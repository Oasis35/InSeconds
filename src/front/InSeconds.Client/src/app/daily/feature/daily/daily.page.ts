import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { TrackRoundComponent } from '../../../gameplay/feature/track-round/track-round.component';
import { TrackRoundStore } from '../../../gameplay/data-access/track-round.store';
import { RoundSubmission } from '../../../gameplay/domain/track-round';
import { ConfirmDialogData } from '../../../ui/modal/confirm-dialog.component';
import { LeaveGuard } from '../../../gameplay/feature/leave-guard';
import { ModalService } from '../../../ui/modal/modal.service';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { SessionStore } from '../../../core/session/session.store';
import { DailyRoundStore, RoundExit } from '../../data-access/daily-round.store';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DailyProgressComponent } from '../../ui/daily-progress/daily-progress.component';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { secondsUntilMidnightUtc, timeLeft } from '../../../core/game-day/game-day';
import { ScoreBreakdownComponent } from '../../ui/score-breakdown/score-breakdown.component';
import { ScoreCountComponent } from '../../ui/score-count/score-count.component';

/**
 * La page du défi (`/daily`) : la manche seulement, chargée à la demande (avec le lecteur) quand le joueur clique sur « Commencer » ou
 * « Reprendre » de l'accueil. Elle crée ou reprend la partie à son arrivée (le clic de l'accueil a déjà déverrouillé le son), affiche la
 * manche que le `DailyRoundStore` indique et branche ce qui est propre au navigateur : les fenêtres (abandon, sortie de partie), le retour
 * de l'onglet. Le résultat, la pause et les erreurs se lisent sur l'accueil (`/`), que la page rejoint quand il n'y a plus rien à jouer ici.
 */
@Component({
  selector: 'app-daily-page',
  imports: [
    TranslatePipe, DecorBackgroundComponent, TrackRoundComponent, BrandComponent, DailyProgressComponent,
    DeezerBadgeComponent, ScoreCountComponent, ScoreBreakdownComponent, ButtonComponent,
  ],
  providers: [DailyRoundStore, TrackRoundStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily.page.html',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class DailyPage implements OnInit {
  protected readonly store = inject(DailyRoundStore);
  protected readonly language = inject(LanguageService);
  protected readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly chrome = inject(ShellChromeStore);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);

  private readonly leaveGuard = new LeaveGuard(inject(ModalService));
  /** La page est détruite (le joueur est parti pendant l'ouverture) : une réponse tardive ne renvoie plus à l'accueil. */
  private destroyed = false;

  /** L'écran affiché : la manche, sinon le chargement (la partie se crée, ou l'accueil reprend la main). */
  protected readonly screen = computed(() => (this.store.isPlaying() ? 'playing' : 'loading'));

  constructor() {
    // La barre du bas disparaît pendant la manche.
    effect(() => this.chrome.setImmersive(this.store.isPlaying()));
    inject(DestroyRef).onDestroy(() => {
      this.chrome.setImmersive(false);
      this.destroyed = true;
      this.store.dispose();
    });
    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte (dernière réponse qui se résout, partie finie
    // ailleurs), il n'y a plus de partie à protéger : la navigation continue.
    effect(() => {
      if (!this.store.isPlaying()) this.leaveGuard.release();
    });
  }

  ngOnInit(): void {
    void this.store.begin().then(exit => this.leaveIfDone(exit));
  }

  /** Garde de sortie : en cours de partie, une fenêtre demande confirmation (aussi vers l'accueil, qui montrera la reprise). */
  canLeave(): boolean | Promise<boolean> {
    if (!this.store.isPlaying()) return true;
    // Le temps qui reste avant le prochain défi, dit en heures ou en minutes (jamais « minuit UTC »).
    const left = timeLeft(secondsUntilMidnightUtc(new Date()));
    const data: ConfirmDialogData = {
      title: this.translate.instant('daily.leaveSheet.title'),
      body: this.translate.instant(left.unit === 'hours' ? 'daily.leaveSheet.bodyHours' : 'daily.leaveSheet.bodyMinutes', { n: left.value }),
      // Les rôles sont inversés à dessein : « Continuer à jouer » est l'action sûre, mise en avant.
      confirmLabel: this.translate.instant('daily.leaveSheet.confirm'),
      cancelLabel: this.translate.instant('daily.leaveSheet.cancel'),
    };
    return this.leaveGuard.confirm(data);
  }

  protected async confirmAbandon(): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('daily.abandonSheet.title'),
      body: this.translate.instant(this.session.isLinked() ? 'daily.abandonSheet.bodyLinked' : 'daily.abandonSheet.body'),
      confirmLabel: this.translate.instant('daily.abandonSheet.confirm'),
      cancelLabel: this.translate.instant('daily.abandonSheet.cancel'),
      tone: 'danger',
    });
    if (confirmed && (await this.store.abandon())) this.leaveIfDone('home');
  }

  protected onAnswered(submission: RoundSubmission): void {
    void this.store.submit(submission);
  }

  /** « Piste suivante » : le morceau suivant, ou le résultat sur l'accueil après le dernier. */
  protected nextTrack(): void {
    this.leaveIfDone(this.store.nextTrack());
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void this.store.refresh().then(exit => this.leaveIfDone(exit));
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.isPlaying()) event.preventDefault();
  }

  /** Plus rien à jouer ici : l'accueil montre le résultat, l'abandon, la pause ou l'erreur (la page de l'adresse précédente ne se garde pas). */
  private leaveIfDone(exit: RoundExit): void {
    if (exit === 'home' && !this.destroyed) void this.router.navigate(['/'], { queryParamsHandling: 'preserve', replaceUrl: true });
  }
}
