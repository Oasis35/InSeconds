import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, untracked, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { pop } from '../../../ui/motion/motion';
import { CLOCK_ALERT_SECONDS, clockLabel } from '../../domain/run';

/**
 * Le chrono d'un morceau, dans le coin de la carte, juste au-dessus de la waveform : « 0:45 » discret, en gris (le cyan est déjà celui de
 * l'écoute) ; les 5 dernières secondes, un gros chiffre blanc qui marque chaque seconde. Il se lit aussi au lecteur d'écran, sans annoncer
 * chaque seconde.
 */
@Component({
  selector: 'app-run-clock',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <span #value data-testid="run-clock" class="block tabular-nums leading-none text-right origin-bottom-right"
      [attr.aria-label]="'runs.clock.label' | translate: { time: label() }" [attr.data-alert]="alert() ? '' : null"
      [style.font-family]="alert() ? 'var(--font-score)' : 'var(--font-clock)'" [style.font-size.px]="alert() ? 28 : 13"
      [style.font-weight]="alert() ? 900 : 500" [style.color]="alert() ? 'var(--text-hi)' : 'var(--text-muted)'"
      [style.margin-top.px]="alert() ? -12 : 0">{{ alert() ? whole() : label() }}</span>
  `,
})
export class RunClockComponent {
  /** Les secondes qui restent. */
  readonly seconds = input.required<number>();

  protected readonly whole = computed(() => Math.max(0, Math.ceil(this.seconds())));
  protected readonly label = computed(() => clockLabel(this.seconds()));
  protected readonly alert = computed(() => this.whole() > 0 && this.whole() <= CLOCK_ALERT_SECONDS);

  private readonly value = viewChild.required<ElementRef<HTMLElement>>('value');

  constructor() {
    // Chaque seconde des dernières marque un petit temps fort.
    effect(() => {
      if (!this.alert()) return;
      this.whole();
      untracked(() => pop(this.value().nativeElement));
    });
  }
}
