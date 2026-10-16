import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Streak, isStreakProtected, pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';

/** Accueil du défi du jour : titre, démarrage, appel à se connecter (invité) ou lien vers le profil (connecté). */
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
  readonly trackCount = input.required<number>();
  readonly streak = input<Streak | null>(null);
  /** Masque le CTA de connexion invité pendant que le toast « série perdue » le porte déjà. */
  readonly hideLoginCta = input(false);
  /** Compte connecté (non invité). */
  readonly linked = input.required<boolean>();
  readonly pseudo = input<string | null>(null);
  readonly startGame = output<void>();

  /** Compte connecté revenant après un jour manqué couvert par un gel. */
  protected readonly frozenLineKey = computed(() => `daily.streakFreeze.frozenLineStrong.${pluralKey(this.streak()?.streak ?? 0)}`);
  protected readonly isProtected = computed(() => isStreakProtected(this.streak(), this.linked()));
}
