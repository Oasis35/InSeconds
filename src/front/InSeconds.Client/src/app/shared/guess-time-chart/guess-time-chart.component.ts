import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DurationBucketDto } from '../../core/models/game.models';

interface GuessBucket {
  key: string;
  label: string;
  count: number;
  highlighted: boolean;
  heightPx: string;
  barColor: string;
  labelColor: string;
}

const BAR_MAX_PX = 32;
const HIGHLIGHT = 'var(--color-accent-3)';
const DURATION_BAR = 'var(--color-violet)';
const NOT_FOUND_BAR = 'var(--color-fail)';
const FAINT = 'var(--text-faint)';

/**
 * Histogramme réutilisable : nombre de joueurs ayant trouvé un morceau par palier
 * d'écoute (`distribution`), plus une barre « ✗ » finale (`notFoundCount`).
 * Purement présentationnel — les couleurs viennent des tokens `:root` de `styles.scss`.
 */
@Component({
  selector: 'app-guess-time-chart',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guess-time-chart.component.html',
})
export class GuessTimeChartComponent {
  /** Comptes par palier, dans l'ordre croissant des durées. */
  readonly distribution = input.required<DurationBucketDto[]>();
  /** Nombre de joueurs n'ayant pas trouvé — barre « ✗ » tout à droite. */
  readonly notFoundCount = input(0);
  /** Met en surbrillance la barre de ce palier (la réponse du joueur courant). */
  readonly highlightDuration = input<number | null>(null);
  /** Met en surbrillance la barre « ✗ » (le joueur courant n'a pas trouvé). */
  readonly highlightNotFound = input(false);
  /** Clé i18n du titre affiché au-dessus du graphique ; masqué si vide. */
  readonly titleKey = input<string>('');

  protected readonly buckets = computed<GuessBucket[]>(() => {
    const distribution = this.distribution();
    const notFound = this.notFoundCount();
    const highlightDuration = this.highlightDuration();
    const max = Math.max(1, notFound, ...distribution.map(d => d.count));

    const height = (count: number): string =>
      count === 0 ? '2px' : `${Math.max(4, Math.round((count / max) * BAR_MAX_PX))}px`;

    const durationBuckets: GuessBucket[] = distribution.map(d => {
      const highlighted = highlightDuration != null && d.durationSeconds === highlightDuration;
      return {
        key: `d${d.durationSeconds}`,
        label: `${d.durationSeconds}s`,
        count: d.count,
        highlighted,
        heightPx: height(d.count),
        barColor: highlighted ? HIGHLIGHT : DURATION_BAR,
        labelColor: highlighted ? HIGHLIGHT : FAINT,
      };
    });

    const notFoundHighlighted = this.highlightNotFound();
    durationBuckets.push({
      key: 'nf',
      label: '✗',
      count: notFound,
      highlighted: notFoundHighlighted,
      heightPx: height(notFound),
      barColor: notFoundHighlighted ? HIGHLIGHT : NOT_FOUND_BAR,
      labelColor: notFoundHighlighted ? HIGHLIGHT : FAINT,
    });

    return durationBuckets;
  });
}
