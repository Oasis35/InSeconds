import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Reprise d'une partie en cours, avec confirmation d'abandon en deux temps : commune aux modes (« Partie en pause », « X / Y pistes déjà
 * écoutées », Reprendre / Abandonner). Chaque mode donne son avertissement d'abandon (le Daily parle de la série, Platines du record) et dit
 * s'il propose de se connecter.
 */
@Component({
  selector: 'app-resume-screen',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resume-screen.component.html',
  host: { class: 'flex-1 flex flex-col' },
})
export class ResumeScreenComponent {
  readonly completedCount = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandonLoading = input(false);
  /** La clé de traduction de l'avertissement d'abandon. */
  readonly warningBodyKey = input.required<string>();
  /** Propose « Ne plus perdre mes parties » (un invité du Daily). */
  readonly showLoginCta = input(false);
  readonly resumeGame = output<void>();
  readonly abandon = output<void>();

  protected readonly showAbandonConfirm = signal(false);
}
