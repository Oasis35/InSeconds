import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunDifficultyColumnsComponent } from '../run-difficulty-columns/run-difficulty-columns.component';
import { PointsPipe } from '../../../ui/format/points.pipe';

/**
 * L'écran « Difficulté ? » de la première manche (ensuite, le choix est sur l'écran de palier, qui reprend les mêmes colonnes) : Facile, Normal ou Mélomane, avec l'objectif en points et ce que vaut au mieux un morceau (docs/runs/proto3.md). Normal est
 * présélectionné ; toucher une ligne lance le premier morceau (la page relaie le geste ; rien ne s'anime entre le toucher et le son, pièges 44 et 46).
 */
@Component({
  selector: 'app-run-difficulty',
  imports: [PointsPipe, TranslatePipe, RunDifficultyColumnsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-difficulty.component.html',
})
export class RunDifficultyComponent {
  readonly round = input.required<number>();
  readonly totalScore = input.required<number>();
  readonly options = input.required<readonly RunDifficultyOption[]>();
  readonly tracksPerRound = input(5);
  /** L'écoute normale d'un morceau : une colonne plus courte (manche boss) le dit. */
  readonly listenSeconds = input(10);
  /** Le choix part au serveur : rien ne se touche plus. */
  readonly busy = input(false);
  readonly choose = output<RunDifficulty>();

  protected readonly selected = signal<RunDifficulty>('safe');
  /** Normal quand la manche le propose, sinon la première difficulté offerte. */
  protected readonly effective = computed(() => {
    const options = this.options();
    return options.some(o => o.difficulty === this.selected()) ? this.selected() : (options[0]?.difficulty ?? 'safe');
  });
}
