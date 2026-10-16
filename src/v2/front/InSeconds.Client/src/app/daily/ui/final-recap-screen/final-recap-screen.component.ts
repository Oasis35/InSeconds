import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AnsweredTrack, DayStats } from '../../domain/daily';
import { ScoreDistributionChartComponent } from '../score-distribution-chart/score-distribution-chart.component';
import { ShareButtonComponent } from '../share-button/share-button.component';
import { TrackResultRow, TrackResultsListComponent } from '../track-results-list/track-results-list.component';

/** Récap de fin de partie : score, répartition du jour, compte à rebours, partage et détail des morceaux. */
@Component({
  selector: 'app-final-recap-screen',
  imports: [TranslatePipe, ShareButtonComponent, TrackResultsListComponent, ScoreDistributionChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './final-recap-screen.component.html',
})
export class FinalRecapScreenComponent {
  readonly results = input.required<readonly AnsweredTrack[]>();
  /** Stats du jour : histogramme par morceau (à la reprise) et répartition des scores. */
  readonly stats = input<DayStats | null>(null);
  readonly displayedScore = input.required<number>();
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly canShare = input(true);
  readonly countdown = input('');
  /** Langue des badges Deezer. */
  readonly lang = input<'fr' | 'en'>('fr');
  readonly share = output<void>();

  protected readonly showTrackDetails = signal(false);

  /**
   * Lignes pour `<app-track-results-list>` : les chiffres du morceau viennent de la réponse quand elle les porte,
   * sinon des stats du jour à la même position (une réponse relue à la reprise n'a ni histogramme ni moyenne).
   */
  protected readonly recapRows = computed<TrackResultRow[]>(() => {
    const byPosition = new Map((this.stats()?.tracks ?? []).map(t => [t.position, t]));
    return this.results().map(r => {
      const own = r.distribution.length > 0;
      const stat = own ? undefined : byPosition.get(r.position);
      return {
        position: r.position,
        artist: r.correctArtist,
        title: r.correctTitle,
        coverUrl: r.coverUrl ?? byPosition.get(r.position)?.coverUrl ?? null,
        artistCorrect: r.artistCorrect,
        titleCorrect: r.titleCorrect,
        listenedSeconds: r.listenedSeconds,
        averageSecondsWhenCorrect: own ? r.averageSecondsWhenCorrect : (stat?.averageSecondsWhenCorrect ?? r.averageSecondsWhenCorrect),
        failureRatePercent: own ? (r.failureRatePercent ?? 0) : (stat?.failureRatePercent ?? r.failureRatePercent ?? 0),
        score: r.score,
        deezerTrackId: r.deezerTrackId,
        distribution: own ? r.distribution : (stat?.distribution ?? []),
        notFoundCount: own ? r.notFoundCount : (stat?.notFoundCount ?? 0),
      };
    });
  });
}
