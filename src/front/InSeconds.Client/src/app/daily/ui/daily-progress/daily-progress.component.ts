import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Bloc « en partie » sous la barre : « Morceau X / N » (suivi du total de la partie quand la page le projette dans `[progressTotal]`), lien Abandonner, barre de progression. */
@Component({
  selector: 'app-daily-progress',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-progress.component.html',
})
export class DailyProgressComponent {
  /** Index 0-based du morceau en cours. */
  readonly currentIndex = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandon = output<void>();
}
