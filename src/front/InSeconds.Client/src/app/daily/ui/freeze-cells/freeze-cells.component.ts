import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

type FreezeCellsSize = 'sm' | 'md' | 'lg';

const SIZES: Record<FreezeCellsSize, { box: number; radius: number; icon: number; gap: number }> = {
  sm: { box: 22, radius: 6,  icon: 9,  gap: 6 },
  md: { box: 28, radius: 8,  icon: 12, gap: 7 },
  lg: { box: 40, radius: 11, icon: 17, gap: 10 },
};

/**
 * Cases de stock de gels (pleines = dégradé glace, vides = pointillés cyan). `fillLast`
 * anime le remplissage de la dernière case pleine (`gel-fill`) — gel tout juste gagné.
 */
@Component({
  selector: 'app-freeze-cells',
  imports: [StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './freeze-cells.component.html',
})
export class FreezeCellsComponent {
  readonly count = input.required<number>();
  readonly max = input.required<number>();
  readonly size = input<FreezeCellsSize>('md');
  readonly fillLast = input(false);

  protected readonly dims = computed(() => SIZES[this.size()]);

  protected readonly cells = computed(() => {
    const count = Math.min(this.count(), this.max());
    return Array.from({ length: this.max() }, (_, i) => ({
      full: i < count,
      animated: this.fillLast() && i === count - 1,
    }));
  });
}
