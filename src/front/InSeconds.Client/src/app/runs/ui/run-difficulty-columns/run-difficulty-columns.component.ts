import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';

/** La plus petite colonne, en part de la plus haute : de quoi poser son cadenas. */
const SHORTEST = 0.3;

/**
 * Une colonne : sa difficulté, la hauteur de son corps (part de la plus haute colonne, qui suit la hauteur de l'écran), où passe l'objectif
 * (part du corps depuis le bas) et ce que vaut au mieux un morceau.
 */
export interface DifficultyColumn {
  readonly option: RunDifficultyOption;
  readonly heightRatio: number;
  readonly objectiveRatio: number;
  /** Le niveau de la difficulté (1, 2, 3 barres pleines). */
  readonly level: number;
  /** Les points qu'un morceau rapporte au mieux dans cette difficulté (le plafond de la manche partagé entre ses morceaux). */
  readonly perTrack: number;
}

const LEVEL: Readonly<Record<RunDifficulty, number>> = { easy: 1, safe: 2, risky: 3 };

/** Les colonnes, de la plus facile à la plus difficile : hauteur proportionnelle au plafond, objectif à sa part du plafond. */
export function difficultyColumns(options: readonly RunDifficultyOption[], tracksPerRound = 1): DifficultyColumn[] {
  const tallest = Math.max(1, ...options.map(o => o.maxScore));
  return [...options]
    .sort((a, b) => LEVEL[a.difficulty] - LEVEL[b.difficulty])
    .map(option => ({
      option,
      heightRatio: Math.max(SHORTEST, Math.round((option.maxScore / tallest) * 100) / 100),
      objectiveRatio: option.maxScore > 0 ? Math.min(1, option.objective / option.maxScore) : 0,
      level: LEVEL[option.difficulty],
      perTrack: Math.round(option.maxScore / Math.max(1, tracksPerRound)),
    }));
}

/**
 * Les trois difficultés d'une manche (Facile, Normal, Mélomane), à plat sur une base commune : la hauteur selon le plafond, l'objectif en
 * points sur son cadenas (la zone dessous assombrie), le niveau en barres, ce que vaut au mieux un morceau et, pour la manche boss, son écoute
 * plus courte. Aucun multiplicateur ni plafond à l'écran. Une colonne se touche pour la choisir (`selected`) ; lancer la manche est un autre geste
 * (« Jouer »), pour que le son se déverrouille dans ce clic (iPhone). Présentation seule.
 */
@Component({
  selector: 'app-run-difficulty-columns',
  imports: [TranslatePipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-difficulty-columns.component.html',
})
export class RunDifficultyColumnsComponent {
  readonly options = input.required<readonly RunDifficultyOption[]>();
  readonly tracksPerRound = input(5);
  /** L'écoute normale d'un morceau : une colonne plus courte (manche boss) le dit. */
  readonly listenSeconds = input(10);
  /** La difficulté choisie (Normal d'abord). */
  readonly selected = model<RunDifficulty>('safe');
  /** Le choix part au serveur : les colonnes ne se touchent plus. */
  readonly busy = input(false);

  protected readonly columns = computed(() => difficultyColumns(this.options(), this.tracksPerRound()));
  protected readonly levels = [1, 2, 3];
}
