import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Un jour de barres : ses parts empilées, de bas en haut, dans l'ordre des couleurs de la légende. */
export interface DayBar {
  day: string;
  parts: readonly number[];
}

/** Une couleur de la légende : son libellé (clé i18n) et un token de couleur. */
export interface BarLegend {
  labelKey: string;
  color: string;
}

/**
 * Des barres verticales par jour, empilées (habitués et nouveaux ; terminées, abandonnées et expirées). Hauteur de 7 rem, le plus haut jour
 * remplit la hauteur. Seuls le premier et le dernier jour sont écrits (`jj/mm`).
 */
@Component({
  selector: 'app-stats-day-bars',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2" data-testid="day-bars">
      <div class="flex items-end gap-px h-28" role="img" [attr.aria-label]="ariaLabel() | translate">
        @for (bar of bars(); track bar.day) {
          <div class="flex-1 min-w-0 flex flex-col-reverse justify-start rounded-t-sm overflow-hidden" data-testid="day-bar"
            [style.height.%]="(total(bar) / max()) * 100" [attr.title]="bar.day + ' : ' + total(bar)">
            @for (part of bar.parts; track $index) {
              @if (part > 0) {
                <div [style.flex-grow]="part" [style.background]="legend()[$index].color"></div>
              }
            }
          </div>
        }
      </div>
      <div class="flex justify-between text-xs tabular-nums" style="color:var(--text-muted)">
        <span>{{ edge(0) }}</span>
        <span>{{ edge(bars().length - 1) }}</span>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs" style="color:var(--text-muted)">
        @for (item of legend(); track item.labelKey) {
          <span class="inline-flex items-center gap-1.5">
            <i class="inline-block w-2 h-2 rounded-sm" [style.background]="item.color"></i>{{ item.labelKey | translate }}
          </span>
        }
      </div>
    </div>
  `,
})
export class StatsDayBarsComponent {
  readonly bars = input.required<readonly DayBar[]>();
  readonly legend = input.required<readonly BarLegend[]>();
  readonly ariaLabel = input.required<string>();

  protected readonly max = computed(() => this.bars().reduce((max, b) => Math.max(max, this.total(b)), 1));

  protected total(bar: DayBar): number {
    return bar.parts.reduce((sum, p) => sum + p, 0);
  }

  /** `aaaa-mm-jj` en `jj/mm` ; vide hors liste. */
  protected edge(index: number): string {
    const day = this.bars()[index]?.day;
    return day ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : '';
  }
}
