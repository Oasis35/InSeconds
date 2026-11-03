import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Hauteur des barres d'une forme inconnue. */
const FLAT = 0.14;
const FLAT_BARS = 60;

/** La forme d'un extrait, figée (la révélation, la pile) : une barre par valeur, plates si la forme manque. Purement décorative. */
@Component({
  selector: 'app-run-wave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    <div class="flex items-end w-full" [style.height.px]="height()" [style.gap.px]="gap()">
      @for (bar of bars(); track $index) {
        <i class="flex-1 block" style="min-width:1px;border-radius:2px 2px 1px 1px" [style.height.%]="bar * 100" [style.background]="color()"></i>
      }
    </div>
  `,
})
export class RunWaveComponent {
  readonly peaks = input<readonly number[] | null>(null);
  readonly height = input(46);
  readonly gap = input(2);
  readonly color = input('var(--wave-old)');

  protected readonly bars = computed<readonly number[]>(() => this.peaks() ?? Array.from({ length: FLAT_BARS }, () => FLAT));
}
