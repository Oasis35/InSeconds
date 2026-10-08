import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/** Toast d'un invité dont la série vient d'être perdue (accueil, une fois par série perdue). */
@Component({
  selector: 'app-lost-streak-toast',
  imports: [RouterLink, TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lost-streak-toast.component.html',
})
export class LostStreakToastComponent {
  readonly lostStreak = input.required<number>();
  readonly dismissed = output<void>();
}
