import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunCardValues, RunHandCard, cardColor, cardGlyph } from '../../domain/run-cards';

/** La plus petite colonne, en part de la plus haute : de quoi poser son cadenas. */
const SHORTEST = 0.3;

/**
 * Une colonne : sa difficulté, la hauteur de son corps (part de la plus haute colonne, qui suit la hauteur de l'écran), et où passe l'objectif
 * (part du corps depuis le bas).
 */
export interface DifficultyColumn {
  readonly option: RunDifficultyOption;
  readonly heightRatio: number;
  readonly objectiveRatio: number;
  /** Le niveau de la difficulté (1, 2, 3 barres pleines). */
  readonly level: number;
}

const LEVEL: Readonly<Record<RunDifficulty, number>> = { easy: 1, safe: 2, risky: 3 };

/** Les colonnes, de la plus facile à la plus risquée : hauteur proportionnelle au plafond, objectif à sa part du plafond. */
export function difficultyColumns(options: readonly RunDifficultyOption[]): DifficultyColumn[] {
  const tallest = Math.max(1, ...options.map(o => o.maxScore));
  return [...options]
    .sort((a, b) => LEVEL[a.difficulty] - LEVEL[b.difficulty])
    .map(option => ({
      option,
      heightRatio: Math.max(SHORTEST, Math.round((option.maxScore / tallest) * 100) / 100),
      objectiveRatio: option.maxScore > 0 ? Math.min(1, option.objective / option.maxScore) : 0,
      level: LEVEL[option.difficulty],
    }));
}

/**
 * L'écran « Difficulté ? » (docs/runs/proto2.md § La difficulté de la manche) : trois colonnes à plat sur une base commune, la hauteur selon le
 * plafond de la manche, l'objectif en pointillé avec son cadenas posé sur la frontière (la zone dessous assombrie), le total atteignable sous
 * chaque plafond, les bonus en main en bas. Aucune colonne n'est présélectionnée : toucher une colonne choisit et lance le premier morceau, au
 * même toucher (la page relaie le geste ; rien ne s'anime entre le toucher et le son, pièges 44 et 46).
 */
@Component({
  selector: 'app-run-difficulty',
  imports: [TranslatePipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-difficulty.component.html',
})
export class RunDifficultyComponent {
  readonly round = input.required<number>();
  readonly totalScore = input.required<number>();
  readonly options = input.required<readonly RunDifficultyOption[]>();
  readonly hand = input<readonly RunHandCard[]>([]);
  /** Ce que valent les cartes de la playlist (le signe des cartes chiffrées). */
  readonly values = input<RunCardValues | null>(null);
  /** L'écoute normale d'un morceau : une colonne plus courte (manche boss) le dit. */
  readonly listenSeconds = input(10);
  /** Le choix part au serveur : les colonnes ne se touchent plus. */
  readonly busy = input(false);
  readonly choose = output<RunDifficulty>();

  /** La colonne touchée, contour à la couleur du joueur pendant l'aller-retour seulement (posé tout de suite, sans animation). */
  private readonly touched = signal<RunDifficulty | null>(null);
  protected readonly chosen = computed(() => (this.busy() ? this.touched() : null));
  protected readonly glyph = cardGlyph;
  protected readonly color = cardColor;
  protected readonly columns = computed(() => difficultyColumns(this.options()));
  protected readonly levels = [1, 2, 3];

  protected pick(difficulty: RunDifficulty): void {
    this.touched.set(difficulty);
    this.choose.emit(difficulty);
  }
}
