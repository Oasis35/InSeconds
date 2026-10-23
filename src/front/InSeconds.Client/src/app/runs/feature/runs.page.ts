import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, effect, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { VersionService } from '../../core/version/version.service';
import { TrackRoundStore } from '../../gameplay/data-access/track-round.store';
import { TrackRoundComponent } from '../../gameplay/feature/track-round.component';
import { RoundSubmission } from '../../gameplay/domain/track-round';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../ui/modal/confirm-dialog.component';
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
 * (abandon, sortie de partie), la fermeture de l'onglet, la nouvelle version du site. Les stores `RunGameStore` et `TrackRoundStore` sont ceux de
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
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private leaveDialog: DialogRef<boolean, ConfirmDialogComponent> | null = null;

  constructor() {
    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => reloadMomentFor(this.store.screen()), inject(DestroyRef));
    // Si la partie quitte « playing » pendant qu'une confirmation de sortie est ouverte, il n'y a plus de manche à protéger : la navigation continue.
    effect(() => {
      if (this.store.screen() !== 'playing' && this.leaveDialog) this.leaveDialog.close(true);
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
      // Les rôles sont inversés à dessein : « Continuer à jouer » est l'action sûre, mise en avant.
      confirmLabel: this.translate.instant('runs.leave.confirm'),
      cancelLabel: this.translate.instant('runs.leave.cancel'),
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
