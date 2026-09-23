import { Component, input, output, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../../../core/services/player-session.service';
import { StreakDto } from '../../../../core/models/game.models';
import { streakPillMode } from '../../../../core/models/streak';
import { StreakIconComponent } from '../../../../shared/streak-icon/streak-icon.component';

/** En-tête du jeu : logo, gélule série/gels ou score selon l'état, avatar profil, barre de progression en partie. */
@Component({
  selector: 'app-game-header',
  imports: [TranslatePipe, RouterLink, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-header.component.html',
})
export class GameHeaderComponent {
  protected readonly playerSession = inject(PlayerSessionService);

  readonly playing = input.required<boolean>();
  readonly showStreak = input.required<boolean>();
  readonly streak = input.required<StreakDto | null>();
  /** Pulse de la gélule (gel tout juste gagné, écrans de fin de partie). */
  readonly pulse = input(false);
  readonly totalScore = input.required<number>();
  readonly currentIndex = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandon = output<void>();
  readonly openStreak = output<void>();

  protected readonly pillMode = computed(() => streakPillMode(this.streak(), this.playerSession.isLinked()));

  /** Pulse ×3 : toujours sur « protégée », sur demande (gel gagné) pour la gélule connectée. */
  protected readonly pillAnimation = computed(() => {
    const mode = this.pillMode();
    return mode === 'protected' || (mode === 'on' && this.pulse())
      ? 'gel-pulse .9s ease-in-out .2s 3'
      : null;
  });
}
