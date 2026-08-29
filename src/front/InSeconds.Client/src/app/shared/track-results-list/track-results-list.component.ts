import { Component, input, signal, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DurationBucketDto } from '../../core/models/game.models';
import { DeezerBadgeComponent } from '../deezer-badge.component';
import { GuessTimeChartComponent } from '../guess-time-chart/guess-time-chart.component';

/** Une ligne de la liste de morceaux d'un défi (récap final / écran « déjà joué »). */
export interface TrackResultRow {
  position: number;
  artist: string;
  title: string;
  coverUrl: string | null;
  /** `null` = pas de réponse du joueur pour ce morceau → pas de chips ✓/✗ ni de durée. */
  artistCorrect: boolean | null;
  titleCorrect: boolean | null;
  listenedDurationSeconds: number | null;
  averageSecondsWhenCorrect: number | null;
  failureRatePercent: number;
  /** `null` → pas de colonne score. */
  score: number | null;
  deezerTrackId: number;
  /** Vide → pas de pop-up (score non cliquable). */
  guessTimeDistribution: DurationBucketDto[];
  notFoundCount: number;
}

/**
 * Liste accordéon des morceaux d'un défi + pop-up histogramme « en combien de temps
 * les autres ont trouvé » au clic sur le score d'un morceau. Le contour (carte,
 * bouton « Voir les morceaux / Masquer ») reste géré par l'écran parent.
 */
@Component({
  selector: 'app-track-results-list',
  imports: [TranslatePipe, DeezerBadgeComponent, GuessTimeChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './track-results-list.component.html',
})
export class TrackResultsListComponent {
  readonly rows = input.required<TrackResultRow[]>();

  /** Morceau dont l'histogramme est ouvert en pop-up, ou `null`. */
  protected readonly openChart = signal<TrackResultRow | null>(null);

  protected hasChart(r: TrackResultRow): boolean {
    return r.guessTimeDistribution.length > 0;
  }

  protected openChartFor(r: TrackResultRow): void {
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
