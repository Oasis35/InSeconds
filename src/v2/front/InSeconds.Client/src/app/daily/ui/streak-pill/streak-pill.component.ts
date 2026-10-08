import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Streak, pluralKey, streakPillMode } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/**
 * Gélule de série de l'en-tête (flamme + série, et stock de gels pour un compte connecté). Le parent la
 * positionne ; un clic émet `open` (panneau de série).
 */
@Component({
  selector: 'app-streak-pill',
  imports: [TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-pill.component.html',
})
export class StreakPillComponent {
  readonly streak = input.required<Streak | null>();
  readonly linked = input.required<boolean>();
  /** Pulse ×3 sur demande (gel gagné), pour la gélule d'un compte connecté. */
  readonly pulse = input(false);
  readonly open = output<void>();

  protected readonly labelKey = computed(() => `daily.streakFreeze.pillLabel.${pluralKey(this.streak()?.streak ?? 0)}`);

  protected readonly pillMode = computed(() => streakPillMode(this.streak(), this.linked()));

  /** Pulse ×3 : toujours sur « protégée », sur demande (gel gagné) pour la gélule connectée. */
  protected readonly animation = computed(() => {
    const mode = this.pillMode();
    return mode === 'protected' || (mode === 'on' && this.pulse())
      ? 'gel-pulse .9s ease-in-out .2s 3'
      : null;
  });
}
