import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/**
 * Toast d'un invité dont la série n'est pas sauvegardée (fin de partie) ; au palier de gel manqué,
 * variante « Tu aurais gagné un gel ! ». Positionné en bas de l'écran.
 */
@Component({
  selector: 'app-guest-streak-toast',
  imports: [RouterLink, TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guest-streak-toast.component.html',
})
export class GuestStreakToastComponent {
  readonly streak = input.required<number>();
  readonly freezeMiss = input.required<boolean>();
  readonly dismissed = output<void>();

  protected readonly streakKey = computed(() => pluralKey(this.streak()));
}
