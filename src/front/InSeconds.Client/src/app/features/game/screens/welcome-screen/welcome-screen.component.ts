import { Component, input, output, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../../../core/services/player-session.service';
import { StreakDto } from '../../../../core/models/game.models';
import { StreakIconComponent } from '../../../../shared/streak-icon/streak-icon.component';

@Component({
  selector: 'app-welcome-screen',
  imports: [TranslatePipe, RouterLink, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-screen.component.html',
  // L'hôte doit occuper la hauteur restante de <main> (flex-col) pour que le
  // justify-center du template centre le bloc verticalement entre header et footer.
  host: { class: 'flex-1 flex flex-col' },
})
export class WelcomeScreenComponent {
  protected readonly playerSession = inject(PlayerSessionService);

  readonly trackCount = input.required<number>();
  readonly streak = input<StreakDto | null>(null);
  /** Masque le CTA de connexion invité pendant que le toast « série perdue » le porte déjà. */
  readonly hideLoginCta = input(false);
  readonly startGame = output<void>();

  /** Compte connecté revenant après un jour manqué couvert par un gel. */
  protected readonly isProtected = computed(() =>
    this.playerSession.isLinked() && this.streak()?.status === 'protected');
}
