import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodayStatsResponse } from '../../../../api/api.generated';
import { ShareButtonComponent } from '../../../../shared/share-button/share-button.component';
import { TrackResultsListComponent, TrackResultRow } from '../../../../shared/track-results-list/track-results-list.component';

export interface RoundResult {
  artistCorrect: boolean;
  titleCorrect: boolean;
  score: number;
  correctArtist: string;
  correctTitle: string;
  listenedDurationSeconds: number;
  averageSecondsWhenCorrect: number | undefined;
  failureRatePercent: number;
  position: number;
  coverUrl: string | null;
  deezerTrackId: number;
}

@Component({
  selector: 'app-final-recap-screen',
  imports: [TranslatePipe, ShareButtonComponent, TrackResultsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './final-recap-screen.component.html',
})
export class FinalRecapScreenComponent {
  readonly results = input.required<RoundResult[]>();
  /** Stats du jour (`GET /api/stats/today`) — porte l'histogramme par morceau. */
  readonly stats = input<TodayStatsResponse | null>(null);
  readonly displayedScore = input.required<number>();
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly canShare = input(true);
  readonly countdown = input('');
  readonly share = output<void>();

  readonly showTrackDetails = signal(false);

  /** Lignes pour `<app-track-results-list>` : `RoundResult` + histogramme depuis `stats` (par position). */
  protected readonly recapRows = computed<TrackResultRow[]>(() => {
    const byPosition = new Map((this.stats()?.tracks ?? []).map(t => [t.position, t]));
    return this.results().map(r => {
      const s = byPosition.get(r.position);
      return {
        position: r.position,
        artist: r.correctArtist,
        title: r.correctTitle,
        coverUrl: r.coverUrl,
        artistCorrect: r.artistCorrect,
        titleCorrect: r.titleCorrect,
        listenedDurationSeconds: r.listenedDurationSeconds,
        averageSecondsWhenCorrect: r.averageSecondsWhenCorrect ?? null,
        failureRatePercent: r.failureRatePercent,
        score: r.score,
        deezerTrackId: r.deezerTrackId,
        guessTimeDistribution: s?.guessTimeDistribution ?? [],
        notFoundCount: s?.notFoundCount ?? 0,
      };
    });
  });
}
