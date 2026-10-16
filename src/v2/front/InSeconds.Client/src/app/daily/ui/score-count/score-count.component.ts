import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { countUp } from './count-up';

/** Un nombre de points qui monte de 0 à sa valeur (la révélation d'un morceau). */
@Component({
  selector: 'app-score-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ shown() }}`,
})
export class ScoreCountComponent {
  readonly value = input.required<number>();
  protected readonly shown = signal(0);

  constructor() {
    effect(() => countUp(this.value(), v => this.shown.set(v), 600));
  }
}
