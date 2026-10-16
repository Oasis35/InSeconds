import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { GuessTimeChartComponent } from '../../../gameplay/ui/guess-time-chart.component';
import { ModalFrameComponent } from '../../../ui/modal/modal-frame.component';
import type { TrackResultRow } from './track-results-list.component';

export interface TrackChartDialogData {
  readonly row: TrackResultRow;
}

/** Contenu de la fenêtre ouverte au clic sur le score d'un morceau : l'histogramme des temps des autres joueurs. */
@Component({
  selector: 'app-track-chart-dialog',
  imports: [ModalFrameComponent, GuessTimeChartComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="row.artist + ' — ' + row.title">
      <p class="text-[10px] font-bold tracking-widest uppercase mb-4"
        style="font-family:var(--font-display);color:var(--text-faint)">{{ 'daily.trackList.guessTimeTitle' | translate }}</p>
      <app-guess-time-chart
        [distribution]="row.distribution"
        [notFoundCount]="row.notFoundCount"
        [highlightDuration]="found ? row.listenedSeconds : null"
        [highlightNotFound]="row.artistCorrect !== null && !found" />
    </app-modal-frame>
  `,
})
export class TrackChartDialogComponent {
  protected readonly row = inject<TrackChartDialogData>(DIALOG_DATA).row;
  /** Le joueur a trouvé l'artiste ou le titre (sa colonne est surlignée, sinon c'est la barre « ✗ »). */
  protected readonly found = !!(this.row.artistCorrect || this.row.titleCorrect);
}
