import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunCardKey, RunCardValues, RunHandCard, cardColor, cardGlyph } from '../../domain/run-cards';
import { RunDifficultyColumnsComponent } from '../run-difficulty-columns/run-difficulty-columns.component';

/**
 * L'écran « Difficulté ? » d'une playlist sans coups de pouce (avec des coups de pouce, le choix est sur l'écran de palier, qui reprend les mêmes
 * colonnes) : Facile, Normal ou Mélomane, avec l'objectif en points et ce que vaut au mieux un morceau (docs/runs/proto3.md). Normal est
 * présélectionné ; toucher une colonne la choisit, « Jouer » lance le premier morceau (la page relaie le geste ; rien ne s'anime entre le toucher
 * et le son, pièges 44 et 46). Les bonus en main s'affichent s'il y en a.
 */
@Component({
  selector: 'app-run-difficulty',
  imports: [TranslatePipe, ButtonComponent, RunDifficultyColumnsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-difficulty.component.html',
})
export class RunDifficultyComponent {
  readonly round = input.required<number>();
  readonly totalScore = input.required<number>();
  readonly options = input.required<readonly RunDifficultyOption[]>();
  readonly tracksPerRound = input(5);
  readonly hand = input<readonly RunHandCard[]>([]);
  /** Ce que valent les cartes de la playlist (le signe des cartes chiffrées). */
  readonly values = input<RunCardValues | null>(null);
  /** L'écoute normale d'un morceau : une colonne plus courte (manche boss) le dit. */
  readonly listenSeconds = input(10);
  /** Le choix part au serveur : rien ne se touche plus. */
  readonly busy = input(false);
  readonly choose = output<RunDifficulty>();

  readonly lang = input('fr');
  protected readonly selected = signal<RunDifficulty>('safe');
  protected readonly glyph = (card: RunCardKey, values: RunCardValues | null): string => cardGlyph(card, values, this.lang());
  protected readonly color = cardColor;
  /** Normal quand la manche le propose, sinon la première difficulté offerte. */
  protected readonly effective = computed(() => {
    const options = this.options();
    return options.some(o => o.difficulty === this.selected()) ? this.selected() : (options[0]?.difficulty ?? 'safe');
  });
}
