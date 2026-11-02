import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { countUp } from './count-up';

/** Un nombre de points qui monte de `from` (0 par défaut) à sa valeur (la révélation d'un morceau : ses points, puis le total). */
@Component({
  selector: 'app-score-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ shown() }}`,
})
export class ScoreCountComponent {
  readonly value = input.required<number>();
  readonly from = input(0);
  /** Délai avant le départ, en millisecondes : le total monte une fois les points du morceau comptés. */
  readonly delay = input(0);
  protected readonly shown = signal(0);

  constructor() {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    inject(DestroyRef).onDestroy(() => timers.forEach(clearTimeout));
    effect(() => {
      const value = this.value(), from = this.from(), delay = this.delay();
      untracked(() => {
        this.shown.set(from);
        if (delay <= 0 || motionReduced()) {
          countUp(value, v => this.shown.set(v), 600, from);
          return;
        }
        const timer = setTimeout(() => {
          timers.delete(timer);
          countUp(value, v => this.shown.set(v), 600, from);
        }, delay);
        timers.add(timer);
      });
    });
  }
}
