import { Component, computed, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Reprise d'une partie en cours, avec confirmation d'abandon en deux temps : commune aux modes (la date si le mode la donne, « Partie en
 * pause », « X morceaux sur Y déjà joués », Reprendre / Abandonner). Chaque mode donne son avertissement d'abandon (le Daily parle de la série,
 * Platines du record), dit s'il propose de se connecter, et peut poser un contenu sous les boutons (le relevé de série du Daily).
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
  /** La date du jour dans la langue, au-dessus du titre (le jeu du jour) ; rien si vide. */
  readonly dateLabel = input('');
  readonly abandonLoading = input(false);
  /** La clé de traduction de l'avertissement d'abandon. */
  readonly warningBodyKey = input.required<string>();
  /** Propose « Ne plus perdre mes parties » (un invité du Daily). */
  readonly showLoginCta = input(false);
  readonly resumeGame = output<void>();
  readonly abandon = output<void>();

  protected readonly showAbandonConfirm = signal(false);
  /** « 1 morceau sur 5 déjà joué » : le singulier du français vaut pour 0 et 1. */
  protected readonly progressKey = computed(() => `daily.resume.progress.${this.completedCount() <= 1 ? 'one' : 'other'}`);
}
