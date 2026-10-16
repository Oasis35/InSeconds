import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GuessBucket } from '../domain/round-result';

interface Bar {
  key: string;
  label: string;
  count: number;
  highlighted: boolean;
  height: string;
  barColor: string;
  labelColor: string;
}

const BAR_MAX_PX = 32;
const HIGHLIGHT = 'var(--color-accent-3)';
const DURATION_BAR = 'var(--color-violet)';
const NOT_FOUND_BAR = 'var(--color-fail)';
const FAINT = 'var(--text-faint)';

/**
 * L'histogramme « en combien de temps les autres ont trouvé » : une barre par palier d'écoute
 * (joueurs qui ont trouvé à ce palier) et une barre « ✗ » pour ceux qui n'ont pas trouvé. La colonne
 * du joueur est surlignée. Purement présentationnel.
 */
@Component({
  selector: 'app-guess-time-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-testid="guess-time-chart" class="mx-auto" style="max-width:210px">
      <div class="flex items-end gap-1" [style.height.px]="showCounts() ? 48 : 36">
        @for (bar of bars(); track bar.key) {
          <div class="flex-1 flex flex-col items-center justify-end gap-0.5 h-full"
               [attr.data-bucket]="bar.key" [attr.data-highlight]="bar.highlighted ? 'true' : null">
            @if (showCounts()) {
              <span class="text-[9px] leading-none tabular-nums" [style.color]="bar.labelColor">{{ bar.count }}</span>
            }
            <div class="rounded-full" style="width:14px" [style.height]="bar.height" [style.background]="bar.barColor"></div>
          </div>
        }
      </div>
      <div class="flex gap-1 mt-0.5">
        @for (bar of bars(); track bar.key) {
          <span class="flex-1 text-center text-[9px] leading-none" [style.color]="bar.labelColor">{{ bar.label }}</span>
        }
      </div>
    </div>
  `,
})
export class GuessTimeChartComponent {
  /** Les comptes par palier, dans l'ordre croissant des durées. */
  readonly distribution = input.required<readonly GuessBucket[]>();
  /** Les joueurs qui n'ont pas trouvé : la barre « ✗ », tout à droite. */
  readonly notFoundCount = input(0);
  /** Surligne la barre de ce palier (la réponse du joueur). */
  readonly highlightDuration = input<number | null>(null);
  /** Surligne la barre « ✗ » (le joueur n'a pas trouvé). */
  readonly highlightNotFound = input(false);
  /** Écrit le nombre de joueurs au-dessus de chaque barre (vue admin). */
  readonly showCounts = input(false);

  protected readonly bars = computed<Bar[]>(() => {
    const distribution = this.distribution();
    const notFound = this.notFoundCount();
    const highlightDuration = this.highlightDuration();
    const max = Math.max(1, notFound, ...distribution.map(bucket => bucket.count));
    const height = (count: number) => (count === 0 ? '2px' : `${Math.max(4, Math.round((count / max) * BAR_MAX_PX))}px`);

    const bars: Bar[] = distribution.map(bucket => {
      const highlighted = highlightDuration !== null && bucket.durationSeconds === highlightDuration;
      return {
        key: `d${bucket.durationSeconds}`,
        label: `${bucket.durationSeconds}s`,
        count: bucket.count,
        highlighted,
        height: height(bucket.count),
        barColor: highlighted ? HIGHLIGHT : DURATION_BAR,
        labelColor: highlighted ? HIGHLIGHT : FAINT,
      };
    });

    const notFoundHighlighted = this.highlightNotFound();
    bars.push({
      key: 'nf',
      label: '✗',
      count: notFound,
      highlighted: notFoundHighlighted,
      height: height(notFound),
      barColor: notFoundHighlighted ? HIGHLIGHT : NOT_FOUND_BAR,
      labelColor: notFoundHighlighted ? HIGHLIGHT : FAINT,
    });
    return bars;
  });
}
