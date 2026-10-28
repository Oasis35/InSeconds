import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Streak, isStreakProtected, pluralKey } from '../../domain/streak';
import { StreakIconComponent } from '../streak-icon/streak-icon.component';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * Accueil du défi du jour : la date, le titre, le nombre de morceaux, le chiffre à battre (le record du joueur, sinon la médiane d'hier),
 * « Commencer », le relevé de série (et la ligne du gel qui l'a protégée), « Créer un compte » pour un invité, et l'accès aux jours passés.
 */
@Component({
  selector: 'app-welcome-screen',
  imports: [TranslatePipe, RouterLink, StreakIconComponent, StreakPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-screen.component.html',
  // L'hôte doit occuper la hauteur restante de <main> (flex-col) pour que le
  // justify-center du template centre le bloc verticalement entre header et footer.
  host: { class: 'flex-1 flex flex-col' },
})
export class WelcomeScreenComponent {
  readonly trackCount = input.required<number>();
  /** La date du jour dans la langue (« mardi 28 octobre ») : la première lettre passe en capitale à l'affichage. */
  readonly dateLabel = input('');
  readonly streak = input<Streak | null>(null);
  /** Le meilleur score du joueur sur ses parties terminées (vide sans partie terminée). */
  readonly bestScore = input<number | null>(null);
  /** La médiane d'hier, montrée seulement sans record (vide sous 5 joueurs). */
  readonly yesterdayMedian = input<number | null>(null);
  /** Masque le CTA de connexion invité pendant que le toast « série perdue » le porte déjà. */
  readonly hideLoginCta = input(false);
  /** Compte connecté (non invité). */
  readonly linked = input.required<boolean>();
  readonly startGame = output<void>();
  /** Toucher sur le relevé de série : la page ouvre le panneau de série. */
  readonly openStreak = output<void>();

  /** Compte connecté revenant après un jour manqué couvert par un gel. */
  protected readonly isProtected = computed(() => isStreakProtected(this.streak(), this.linked()));
  protected readonly protectedKey = computed(() => `daily.streakFreeze.protectedLine.${pluralKey(this.streak()?.missedDays ?? 1)}`);
}
