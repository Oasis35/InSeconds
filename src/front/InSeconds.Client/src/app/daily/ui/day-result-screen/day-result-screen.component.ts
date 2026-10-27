import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { ArchiveDay } from '../../domain/archive';
import { DayStats } from '../../domain/daily';
import { Highlight, highlightOf } from '../../domain/highlight';
import { TrackResultRow, TrackResultsListComponent } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { ScoreDistributionChartComponent } from '../score-distribution-chart/score-distribution-chart.component';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { YesterdayAnswersCardComponent } from '../yesterday-answers-card/yesterday-answers-card.component';

/**
 * Le résultat du jour, juste après la partie comme à chaque visite suivante, toujours dans le même ordre : le score et le compte à rebours,
 * « mieux que X % » et le moment fort, l'égaliseur des scores du jour, la partie en barres (qui déplie les morceaux), le partage et les
 * réponses d'hier. Seule différence juste après la partie : le score monte (la page le fait défiler) et les toasts de série apparaissent.
 */
@Component({
  selector: 'app-day-result-screen',
  imports: [TranslatePipe, SecondsPipe, ShareButtonComponent, TrackResultsListComponent, ScoreDistributionChartComponent, YesterdayAnswersCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './day-result-screen.component.html',
})
export class DayResultScreenComponent {
  /** Le score affiché ; `null` tant que les stats d'une partie déjà jouée ne sont pas revenues. */
  readonly score = input.required<number | null>();
  readonly rows = input.required<readonly TrackResultRow[]>();
  /** Stats du jour : égaliseur et « mieux que X % » ; rien des deux sans elles (piège 41). */
  readonly stats = input<DayStats | null>(null);
  /** Les réponses d'hier ; rien sans défi hier. */
  readonly yesterday = input<ArchiveDay | null>(null);
  readonly countdown = input.required<string>();
  /** La partie vient de finir (le score défile) ; repère des tests de bout en bout. */
  readonly fresh = input(false);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly canShare = input(true);
  /** Langue des badges Deezer et de la date d'hier. */
  readonly lang = input<'fr' | 'en'>('fr');
  readonly share = output<void>();

  protected readonly showTracks = signal(false);

  protected readonly betterThanPercent = computed(() => this.stats()?.betterThanPercent ?? null);

  protected readonly highlight = computed<Highlight | null>(() =>
    highlightOf(this.rows()
      .filter(r => r.listenedSeconds !== null)
      .map(r => ({
        position: r.position,
        artist: r.artist,
        found: r.artistCorrect === true || r.titleCorrect === true,
        listenedSeconds: r.listenedSeconds!,
        distribution: r.distribution,
        notFoundCount: r.notFoundCount,
      }))));

  /** Une barre par morceau : verte (artiste et titre), rouge (rien), moitié-moitié (l'un des deux) ; éteinte sans réponse. */
  protected barOf(row: TrackResultRow): string {
    if (row.artistCorrect === null) return 'var(--text-sep)';
    if (row.artistCorrect && row.titleCorrect) return 'var(--color-success)';
    if (!row.artistCorrect && !row.titleCorrect) return 'var(--color-fail)';
    return 'linear-gradient(90deg, var(--color-success) 50%, var(--color-fail) 50%)';
  }
}
