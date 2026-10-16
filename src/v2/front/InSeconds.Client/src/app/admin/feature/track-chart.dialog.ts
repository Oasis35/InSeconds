import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { GuessTimeChartComponent } from '../../gameplay/ui/guess-time-chart.component';
import { ModalFrameComponent } from '../../ui/modal/modal-frame.component';
import { ChallengeTrackStats } from '../domain/challenge';

export interface TrackChartDialogData {
  readonly track: ChallengeTrackStats;
}

/**
 * La pop-up de la répartition des temps d'un morceau d'un défi : « en combien de temps les autres ont
 * trouvé », avec le nombre de joueurs au-dessus de chaque barre (vue admin). Échap et le bouton ferment.
 */
@Component({
  selector: 'app-admin-track-chart-dialog',
  imports: [ModalFrameComponent, GuessTimeChartComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="track.position + '. ' + track.artist + ' — ' + track.title">
      <p class="text-[10px] font-bold tracking-widest uppercase mb-4"
        style="font-family:var(--font-display);color:var(--text-faint)">{{ 'admin.challenges.guessTimeTitle' | translate }}</p>
      <app-guess-time-chart [showCounts]="true" [distribution]="distribution" [notFoundCount]="track.notFoundCount" />
    </app-modal-frame>
  `,
})
export class TrackChartDialog {
  protected readonly track = inject<TrackChartDialogData>(DIALOG_DATA).track;
  /** Le graphique lit des `durationSeconds` (le domaine de la manche), l'admin des `seconds`. */
  protected readonly distribution = this.track.guessTimeDistribution.map(bucket => ({
    durationSeconds: bucket.seconds,
    count: bucket.count,
  }));
}
