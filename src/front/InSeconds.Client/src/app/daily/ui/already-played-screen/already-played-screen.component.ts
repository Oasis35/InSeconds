import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DayStats } from '../../domain/daily';
import { ScoreDistributionChartComponent } from '../score-distribution-chart/score-distribution-chart.component';
import { ShareButtonComponent } from '../share-button/share-button.component';
import { TrackResultRow, TrackResultsListComponent } from '../track-results-list/track-results-list.component';

/** Écran « déjà joué » : compte à rebours, score, répartition du jour, partage et détail des morceaux. */
@Component({
  selector: 'app-already-played-screen',
  imports: [TranslatePipe, ShareButtonComponent, TrackResultsListComponent, ScoreDistributionChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './already-played-screen.component.html',
})
export class AlreadyPlayedScreenComponent {
  readonly stats = input<DayStats | null>(null);
  readonly abandoned = input(false);
  readonly countdown = input.required<string>();
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  /** Langue des badges Deezer. */
  readonly lang = input<'fr' | 'en'>('fr');
  readonly share = output<void>();

  protected readonly showTrackDetails = signal(false);

  /** Lignes pour `<app-track-results-list>` (mêmes lignes que le récap final). */
  protected readonly playedRows = computed<TrackResultRow[]>(() =>
    (this.stats()?.tracks ?? []).map(t => ({
      position: t.position,
      artist: t.artist,
      title: t.title,
      coverUrl: t.coverUrl,
      artistCorrect: t.artistCorrect,
      titleCorrect: t.titleCorrect,
      listenedSeconds: t.listenedSeconds,
      averageSecondsWhenCorrect: t.averageSecondsWhenCorrect,
      failureRatePercent: t.failureRatePercent,
      score: t.score,
      deezerTrackId: t.deezerTrackId,
      distribution: t.distribution,
      notFoundCount: t.notFoundCount,
    })));
}
