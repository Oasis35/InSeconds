import { Component, input, output, signal, computed, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodayStatsResponse, TrackStat } from '../../../../api/api.generated';
import { ShareButtonComponent } from '../../../../shared/share-button/share-button.component';
import { DeezerBadgeComponent } from '../../../../shared/deezer-badge.component';
import { GuessTimeChartComponent } from '../../../../shared/guess-time-chart/guess-time-chart.component';

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
  imports: [TranslatePipe, ShareButtonComponent, DeezerBadgeComponent, GuessTimeChartComponent],
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

  /** Morceau dont l'histogramme est ouvert en popup, ou `null`. */
  protected readonly openChart = signal<RoundResult | null>(null);

  private readonly statsByPosition = computed(() => {
    const map = new Map<number, TrackStat>();
    for (const t of this.stats()?.tracks ?? []) map.set(t.position, t);
    return map;
  });

  protected chartStat(r: RoundResult): TrackStat | undefined {
    return this.statsByPosition().get(r.position);
  }

  protected hasChart(r: RoundResult): boolean {
    return (this.chartStat(r)?.guessTimeDistribution?.length ?? 0) > 0;
  }

  protected openChartFor(r: RoundResult): void {
    if (this.hasChart(r)) this.openChart.set(r);
  }

  protected closeChart(): void {
    this.openChart.set(null);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closeChart();
  }
}
