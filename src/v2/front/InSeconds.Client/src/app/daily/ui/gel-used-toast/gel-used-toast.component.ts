import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/** Toast d'un compte connecté : « 1 gel a sauvé ta série » (fin de partie). */
@Component({
  selector: 'app-gel-used-toast',
  imports: [TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gel-used-toast.component.html',
})
export class GelUsedToastComponent {
  readonly freezesUsed = input.required<number>();
  readonly streak = input.required<number | null>();
  readonly dismissed = output<void>();

  protected readonly usedKey = computed(() => pluralKey(this.freezesUsed()));
}
