import { Component, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodayStatsResponse } from '../../../../api/api.generated';
import { ShareButtonComponent } from '../../../../shared/share-button/share-button.component';
import { TrackResultsListComponent, TrackResultRow } from '../../../../shared/track-results-list/track-results-list.component';

@Component({
  selector: 'app-already-played-screen',
  imports: [TranslatePipe, ShareButtonComponent, TrackResultsListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './already-played-screen.component.html',
})
export class AlreadyPlayedScreenComponent {
  readonly stats = input<TodayStatsResponse | null>(null);
  readonly abandoned = input(false);
  readonly countdown = input.required<string>();
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly share = output<void>();

  protected readonly showTrackDetails = signal(false);

  /** Lignes pour `<app-track-results-list>` (mêmes lignes que le récap final). */
  protected readonly playedRows = computed<TrackResultRow[]>(() =>
    (this.stats()?.tracks ?? []).map(t => ({
      position: t.position,
      artist: t.artist,
      title: t.title,
      coverUrl: t.coverUrl ?? null,
      artistCorrect: t.artistCorrect ?? null,
      titleCorrect: t.titleCorrect ?? null,
      listenedDurationSeconds: t.listenedDurationSeconds ?? null,
      averageSecondsWhenCorrect: t.averageSecondsWhenCorrect ?? null,
      failureRatePercent: t.failureRatePercent,
      score: t.score ?? null,
      deezerTrackId: t.deezerTrackId,
      guessTimeDistribution: t.guessTimeDistribution,
      notFoundCount: t.notFoundCount,
    })));
}
