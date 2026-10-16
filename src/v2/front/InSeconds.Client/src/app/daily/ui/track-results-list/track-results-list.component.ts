import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalService } from '../../../ui/modal/modal.service';
import { GuessBucket } from '../../domain/daily';
import { DeezerBadgeComponent } from '../deezer-badge/deezer-badge.component';
import { TrackChartDialogComponent, TrackChartDialogData } from './track-chart-dialog.component';

/** Une ligne de la liste de morceaux d'un défi (récap final / écran « déjà joué »). */
export interface TrackResultRow {
  position: number;
  artist: string;
  title: string;
  coverUrl: string | null;
  /** `null` = pas de réponse du joueur pour ce morceau → pas de chips ✓/✗ ni de durée. */
  artistCorrect: boolean | null;
  titleCorrect: boolean | null;
  listenedSeconds: number | null;
  averageSecondsWhenCorrect: number | null;
  failureRatePercent: number;
  /** `null` → pas de colonne score. */
  score: number | null;
  deezerTrackId: number;
  /** Vide → pas de pop-up (score non cliquable). */
  distribution: readonly GuessBucket[];
  notFoundCount: number;
}

/**
 * Liste des morceaux d'un défi + pop-up histogramme « en combien de temps les autres ont trouvé »
 * au clic sur le score d'un morceau. Le contour (carte, bouton « Voir les morceaux / Masquer »)
 * reste géré par l'écran parent.
 */
@Component({
  selector: 'app-track-results-list',
  imports: [TranslatePipe, DeezerBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './track-results-list.component.html',
})
export class TrackResultsListComponent {
  private readonly modal = inject(ModalService);

  readonly rows = input.required<readonly TrackResultRow[]>();
  /** Langue des badges Deezer. */
  readonly lang = input<'fr' | 'en'>('fr');

  protected hasChart(row: TrackResultRow): boolean {
    return row.distribution.length > 0;
  }

  protected openChartFor(row: TrackResultRow): void {
    if (!this.hasChart(row)) return;
    this.modal.open<void, TrackChartDialogData, TrackChartDialogComponent>(TrackChartDialogComponent, {
      data: { row },
      maxWidth: '21.25rem',
    });
  }
}
