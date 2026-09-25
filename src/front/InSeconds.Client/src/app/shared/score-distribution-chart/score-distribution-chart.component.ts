import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodayStatsResponse } from '../../api/api.generated';

/** Une case de l'égaliseur (une colonne = une tranche de score, empilée en `SEGMENTS` cases). */
interface EqualizerCell {
  key: string;
  x: number;
  y: number;
  lit: boolean;
  fill: string;
  opacity: number;
}

interface ScoreMarker {
  /** Position réelle du repère sur l'axe. */
  tickX: number;
  /** Position de l'étiquette (décalée pour rester lisible, cf. `LABEL_GUARD`). */
  labelX: number;
  value: number;
}

interface ScoreChart {
  cells: EqualizerCell[];
  cellWidth: number;
  median: ScoreMarker | null;
  lowest: ScoreMarker | null;
  highest: ScoreMarker | null;
}

/** Sous ce nombre de joueurs, la phrase « Tu fais mieux que X % » est masquée (peu parlante). */
export const MIN_PLAYERS_FOR_PERCENT = 5;

// Géométrie du SVG (viewBox 300 × VIEW_HEIGHT).
const LEFT = 10;
const WIDTH = 280;
const BARS_HEIGHT = 100;
const SEGMENTS = 8;
const CELL_GAP_X = 3;
const CELL_GAP_Y = 3;
export const VIEW_HEIGHT = 136;
/** Distance minimale entre l'étiquette de la médiane et les bords (où sont « plus bas »/« plus haut »). */
const LABEL_GUARD = 45;

const MINE = 'var(--color-accent-3)';
const OTHERS = 'var(--color-violet)';
const UNLIT = 'var(--text-sep)';

/**
 * Égaliseur « répartition des scores du jour » (écrans « Déjà joué » et « Score final ») :
 * une colonne par tranche de score (`TodayStatsResponse.scoreDistribution`), la tranche du
 * joueur en orange, un repère médiane et les scores le plus bas / le plus haut sous l'axe,
 * plus la phrase « Tu fais mieux que X % des joueurs » à partir de `MIN_PLAYERS_FOR_PERCENT`.
 * Présentationnel pur — couleurs via les tokens `:root` de `styles.scss`.
 */
@Component({
  selector: 'app-score-distribution-chart',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './score-distribution-chart.component.html',
})
export class ScoreDistributionChartComponent {
  readonly stats = input.required<TodayStatsResponse>();

  protected readonly viewHeight = VIEW_HEIGHT;
  protected readonly axisY = BARS_HEIGHT + 4;
  protected readonly cellHeight = BARS_HEIGHT / SEGMENTS - CELL_GAP_Y;
  protected readonly left = LEFT;
  protected readonly right = LEFT + WIDTH;

  protected readonly chart = computed<ScoreChart | null>(() => {
    const s = this.stats();
    const buckets = s.scoreDistribution ?? [];
    if (buckets.length === 0 || s.maxPossibleScore <= 0) return null;

    const maxCount = Math.max(1, ...buckets.map(b => b.count));
    const bucketWidth = WIDTH / buckets.length;
    const yours = s.yourScore;
    // Un score au-delà de la dernière borne (réglage modifié en cours de journée) → dernière colonne.
    const found = yours == null ? -1 : buckets.findIndex(b => yours <= b.maxScore);
    const mineIndex = yours != null && found === -1 ? buckets.length - 1 : found;

    const cells: EqualizerCell[] = [];
    buckets.forEach((b, i) => {
      const litCount = b.count === 0 ? 0 : Math.max(1, Math.round((b.count / maxCount) * SEGMENTS));
      const isMine = i === mineIndex;
      for (let k = 0; k < SEGMENTS; k++) {
        const lit = k < litCount;
        cells.push({
          key: `${i}-${k}`,
          x: LEFT + i * bucketWidth + CELL_GAP_X,
          y: BARS_HEIGHT - (k + 1) * (BARS_HEIGHT / SEGMENTS) + CELL_GAP_Y - 1,
          lit,
          fill: !lit ? UNLIT : isMine ? MINE : OTHERS,
          // Colonnes des autres joueurs : dégradé du bas (sombre) vers le haut (vif).
          opacity: lit && !isMine ? 0.35 + (0.65 * (k + 1)) / SEGMENTS : 1,
        });
      }
    });

    const xOf = (v: number) => LEFT + (Math.min(Math.max(v, 0), s.maxPossibleScore) / s.maxPossibleScore) * WIDTH;
    const hasPlayers = s.totalPlayers > 0;

    return {
      cells,
      cellWidth: bucketWidth - 2 * CELL_GAP_X,
      median: hasPlayers
        ? {
            tickX: xOf(s.medianScore),
            labelX: Math.min(Math.max(xOf(s.medianScore), LEFT + LABEL_GUARD), LEFT + WIDTH - LABEL_GUARD),
            value: s.medianScore,
          }
        : null,
      lowest: hasPlayers && s.minScore != null ? { tickX: xOf(s.minScore), labelX: LEFT, value: s.minScore } : null,
      highest: hasPlayers && s.maxScore != null ? { tickX: xOf(s.maxScore), labelX: LEFT + WIDTH, value: s.maxScore } : null,
    };
  });

  /** % des autres joueurs battus, masqué sous `MIN_PLAYERS_FOR_PERCENT` joueurs. */
  protected readonly betterThanPercent = computed<number | null>(() => {
    const s = this.stats();
    return s.totalPlayers >= MIN_PLAYERS_FOR_PERCENT && s.betterThanPercent != null ? s.betterThanPercent : null;
  });
}
