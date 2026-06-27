import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** En-tête du jeu : logo, streak / score selon l'état, barre de progression en partie. */
@Component({
  selector: 'app-game-header',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './game-header.component.html',
})
export class GameHeaderComponent {
  readonly playing = input.required<boolean>();
  readonly showStreak = input.required<boolean>();
  readonly streak = input.required<number>();
  readonly totalScore = input.required<number>();
  readonly currentIndex = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandon = output<void>();
}
