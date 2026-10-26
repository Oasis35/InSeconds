import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScoreChartData } from '../../domain/daily';

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

// Géométrie du SVG (viewBox 300 × VIEW_HEIGHT).
const LEFT = 10;
const WIDTH = 280;
// Égaliseur compact : 5 cases de 10 de haut, et une seule ligne d'étiquettes sous l'axe, pour que l'écran du résultat du jour
// tienne sur un téléphone.
const BARS_HEIGHT = 50;
const SEGMENTS = 5;
const CELL_GAP_X = 3;
const CELL_GAP_Y = 3;
export const VIEW_HEIGHT = BARS_HEIGHT + 22;
/**
 * Distance minimale entre le centre de l'étiquette « médiane 2250 » (environ 80 unités de large) et les bords, où sont le score le plus
 * bas et le plus haut (environ 30 unités chacun) : moins, et la médiane se pose sur le plus bas quand elle est au plus bas (tous les scores à 0).
 */
const LABEL_GUARD = 75;

const MINE = 'var(--color-accent-3)';
const OTHERS = 'var(--color-violet)';
const UNLIT = 'var(--text-sep)';

/**
 * Égaliseur « répartition des scores » (écran du résultat du jour et page d'un jour passé) :
 * une colonne par tranche de score (`scoreDistribution`), la tranche du
 * joueur en orange, un repère médiane et les scores le plus bas / le plus haut sous l'axe,
 * plus la phrase « Tu fais mieux que X % des joueurs » quand le serveur la donne (5 joueurs au moins, seuil du serveur) et que
 * l'écran ne l'affiche pas lui-même (`showBetterThan`).
 * Présentationnel pur - couleurs via les tokens `:root` de `styles.scss`.
 */
@Component({
  selector: 'app-score-distribution-chart',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './score-distribution-chart.component.html',
})
export class ScoreDistributionChartComponent {
  readonly stats = input.required<ScoreChartData>();
  /** Faux quand l'écran affiche lui-même « Tu fais mieux que X % » (sous le score du résultat du jour). */
  readonly showBetterThan = input(true);

  protected readonly viewHeight = VIEW_HEIGHT;
  protected readonly axisY = BARS_HEIGHT + 4;
  protected readonly cellHeight = BARS_HEIGHT / SEGMENTS - CELL_GAP_Y;
  protected readonly left = LEFT;
  protected readonly right = LEFT + WIDTH;

  protected readonly chart = computed<ScoreChart | null>(() => {
    const s = this.stats();
    const buckets = s.scoreDistribution;
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
      const litFill = i === mineIndex ? MINE : OTHERS;
      for (let k = 0; k < SEGMENTS; k++) {
        const lit = k < litCount;
        cells.push({
          key: `${i}-${k}`,
          x: LEFT + i * bucketWidth + CELL_GAP_X,
          y: BARS_HEIGHT - (k + 1) * (BARS_HEIGHT / SEGMENTS) + CELL_GAP_Y - 1,
          lit,
          fill: lit ? litFill : UNLIT,
          // Colonnes des autres joueurs : dégradé du bas (sombre) vers le haut (vif).
          opacity: lit && litFill === OTHERS ? 0.35 + (0.65 * (k + 1)) / SEGMENTS : 1,
        });
      }
    });

    const xOf = (v: number) => LEFT + (Math.min(Math.max(v, 0), s.maxPossibleScore) / s.maxPossibleScore) * WIDTH;
    const median = s.minScore != null ? s.medianScore : null;
    const hasPlayers = median != null;

    return {
      cells,
      cellWidth: bucketWidth - 2 * CELL_GAP_X,
      median: median != null
        ? {
            tickX: xOf(median),
            labelX: Math.min(Math.max(xOf(median), LEFT + LABEL_GUARD), LEFT + WIDTH - LABEL_GUARD),
            value: median,
          }
        : null,
      lowest: hasPlayers && s.minScore != null ? { tickX: xOf(s.minScore), labelX: LEFT, value: s.minScore } : null,
      highest: hasPlayers && s.maxScore != null ? { tickX: xOf(s.maxScore), labelX: LEFT + WIDTH, value: s.maxScore } : null,
    };
  });

  /** % des autres joueurs battus : vide sous 5 joueurs (le serveur applique le seuil). */
  protected readonly betterThanPercent = computed<number | null>(() => this.stats().betterThanPercent);
}
