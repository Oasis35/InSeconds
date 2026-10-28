import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Streak, pluralKey, streakPillMode } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/**
 * Relevé de série sous « Commencer » : flamme et jours de série, puis le stock de gels pour un compte connecté, en texte, sans pastille ni
 * lueur. Rien quand aucune série n'est en cours. Un toucher émet `open` (panneau de série).
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
  readonly open = output<void>();

  protected readonly labelKey = computed(() => `daily.streakFreeze.pillLabel.${pluralKey(this.streak()?.streak ?? 0)}`);
  protected readonly daysKey = computed(() => `daily.streakFreeze.pillDays.${pluralKey(this.streak()?.streak ?? 0)}`);
  protected readonly freezesKey = computed(() => `daily.streakFreeze.pillFreezes.${pluralKey(this.streak()?.freezes ?? 0)}`);

  protected readonly pillMode = computed(() => streakPillMode(this.streak(), this.linked()));
}
