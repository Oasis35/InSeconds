import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

/** En-tête du jeu : logo, streak / score selon l'état, avatar profil, barre de progression en partie. */
@Component({
  selector: 'app-game-header',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-header.component.html',
})
export class GameHeaderComponent {
  protected readonly playerSession = inject(PlayerSessionService);

  readonly playing = input.required<boolean>();
  readonly showStreak = input.required<boolean>();
  readonly streak = input.required<number>();
  readonly totalScore = input.required<number>();
  readonly currentIndex = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandon = output<void>();

  protected profileInitial(): string {
    const pseudo = this.playerSession.pseudo();
    return pseudo ? pseudo.charAt(0).toUpperCase() : '?';
  }
}
