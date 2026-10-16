import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FreezeCellsComponent } from '../freeze-cells/freeze-cells.component';

/** Toast d'un compte connecté : « +1 gel gagné ! » (fin de partie), avec le stock et la dernière case qui se remplit. */
@Component({
  selector: 'app-gel-earned-toast',
  imports: [TranslatePipe, FreezeCellsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gel-earned-toast.component.html',
})
export class GelEarnedToastComponent {
  readonly streak = input.required<number | null>();
  readonly freezes = input.required<number>();
  readonly maxFreezes = input.required<number>();
  readonly dismissed = output<void>();
}
